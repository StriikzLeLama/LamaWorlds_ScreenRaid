import logging
import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import pyvips
from bs4 import BeautifulSoup
from bs4.element import Tag
from bs4.formatter import EntitySubstitution, HTMLFormatter
from django.utils.translation import gettext as \_
from typing\_extensions import Self, override

from zerver.lib.exceptions import ErrorCode, JsonableError
from zerver.lib.mime\_types import AUDIO\_INLINE\_MIME\_TYPES, INLINE\_MIME\_TYPES, bare\_content\_type
from zerver.lib.queue import queue\_event\_on\_commit
from zerver.models import Attachment, ImageAttachment

DEFAULT\_AVATAR\_SIZE = 100
MEDIUM\_AVATAR\_SIZE = 500
DEFAULT\_EMOJI\_SIZE = 64

\# We refuse to deal with any image whose total pixelcount exceeds
\# this. This is chosen to be around a quarter of a gigabyte for a
\# 24-bit (3bpp) image.
IMAGE\_BOMB\_TOTAL\_PIXELS = 90000000
IMAGE\_MAX\_ANIMATED\_PIXELS = IMAGE\_BOMB\_TOTAL\_PIXELS / 3

\# Reject emoji which, after resizing, have stills larger than this
MAX\_EMOJI\_GIF\_FILE\_SIZE\_BYTES = 128 \* 1024 # 128 kb

@dataclass(frozen=True)
class BaseThumbnailFormat: # noqa: PLW1641
 extension: str
 max\_width: int
 max\_height: int
 animated: bool

 @override
 def \_\_eq\_\_(self, other: object) -> bool:
 if not isinstance(other, BaseThumbnailFormat):
 return False
 return str(self) == str(other)

 @override
 def \_\_str\_\_(self) -> str:
 animated = "-anim" if self.animated else ""
 return f"{self.max\_width}x{self.max\_height}{animated}.{self.extension}"

 @classmethod
 def from\_string(cls, format\_string: str) -> Self \| None:
 format\_parts = re.match(r"(\\d+)x(\\d+)(-anim)?\\.(\\w+)$", format\_string)
 if format\_parts is None:
 return None

 return cls(
 max\_width=int(format\_parts\[1\]),
 max\_height=int(format\_parts\[2\]),
 animated=format\_parts\[3\] is not None,
 extension=format\_parts\[4\],
 )

@dataclass(frozen=True, eq=False)
class ThumbnailFormat(BaseThumbnailFormat):
 opts: str \| None = ""

\# Note that this is serialized into a JSONB column in the database,
\# and as such fields cannot be removed without a migration.
@dataclass(frozen=True, eq=False)
class StoredThumbnailFormat(BaseThumbnailFormat):
 content\_type: str
 width: int
 height: int
 byte\_size: int

\# Formats that we generate; the first animated and non-animated
\# options on this list are the ones which are written into
\# rendered\_content.
THUMBNAIL\_OUTPUT\_FORMATS = (
 # We generate relatively large default "thumbnails", so that
 # clients that do not understand the thumbnailing protocol
 # (e.g. mobile) get something which does not look pixelated. This
 # is also useful when the web client lightbox temporarily shows an
 # upsized thumbnail while loading the full resolution image.
 ThumbnailFormat("webp", 840, 560, animated=True),
 ThumbnailFormat("webp", 840, 560, animated=False),
)

\# This format is generated, in addition to THUMBNAIL\_OUTPUT\_FORMATS,
\# for images in THUMBNAIL\_ACCEPT\_IMAGE\_TYPES which are not in
\# INLINE\_MIME\_TYPES: somewhat-common image types which are not broadly
\# supported by browsers.
TRANSCODED\_IMAGE\_FORMAT = ThumbnailFormat("webp", 4032, 3024, animated=False)

\# These are the image content-types which the server supports parsing
\# and thumbnailing; these do not need to supported on all browsers,
\# since we will the serving thumbnailed versions of them. Note that
\# this does not provide any \*security\*, since the content-type is
\# provided by the browser, and may not match the bytes they uploaded.
#
\# This should be kept synced with the client-side list in
\# web/src/upload.ts. Any additions below must be accompanied by
\# changes to the pyvips block below as well.
THUMBNAIL\_ACCEPT\_IMAGE\_TYPES = frozenset(
 \[\
 "image/avif",\
 "image/gif",\
 "image/heic",\
 "image/jpeg",\
 "image/png",\
 "image/tiff",\
 "image/webp",\
 \]
)

\# This is what enforces security limitations on which formats are
\# parsed; we disable all loaders, then re-enable the ones we support
\# -- then explicitly disable any "untrusted" ones, in case libvips for
\# some reason marks one of the above formats as such (because they are
\# no longer fuzzed, for instance).
#
\# Note that only libvips >= 8.13 (Ubuntu 24.04 or later, Debian 12 or
\# later) supports this! These are no-ops on earlier versions of libvips.
pyvips.operation\_block\_set("VipsForeignLoad", True)
pyvips.operation\_block\_set("VipsForeignLoadHeif", False) # image/avif, image/heic
pyvips.operation\_block\_set("VipsForeignLoadNsgif", False) # image/gif
pyvips.operation\_block\_set("VipsForeignLoadJpeg", False) # image/jpeg
pyvips.operation\_block\_set("VipsForeignLoadPng", False) # image/png
pyvips.operation\_block\_set("VipsForeignLoadTiff", False) # image/tiff
pyvips.operation\_block\_set("VipsForeignLoadWebp", False) # image/webp
pyvips.block\_untrusted\_set(True)

\# Disable the operations cache; our only use here is thumbnail\_buffer,
\# which does not make use of it.
pyvips.voperation.cache\_set\_max(0)

class BadImageError(JsonableError):
 code = ErrorCode.BAD\_IMAGE

@contextmanager
def libvips\_check\_image(
 image\_data: bytes \| pyvips.Source, truncated\_animation: bool = False
) -\> Iterator\[pyvips.Image\]:
 # The primary goal of this is to verify that the image is valid,
 # and raise BadImageError otherwise. The yielded \`source\_image\`
 # may be ignored, since calling \`thumbnail\_buffer\` is faster than
 # calling \`thumbnail\_image\` on a pyvips.Image, since the latter
 # cannot make use of shrink-on-load optimizations:
 # https://www.libvips.org/API/current/libvips-resample.html#vips-thumbnail-image
 try:
 if isinstance(image\_data, bytes):
 source\_image = pyvips.Image.new\_from\_buffer(image\_data, "")
 else:
 source\_image = pyvips.Image.new\_from\_source(image\_data, "", access="sequential")
 except pyvips.Error:
 raise BadImageError(\_("Could not decode image; did you upload an image file?"))

 if not truncated\_animation:
 # For places where we do not truncate animations (e.g. emoji,
 # where the original is never served to clients, so we must
 # preserve the full animation) we count total pixels across
 # all frames for the limit.
 if (
 source\_image.width \* source\_image.height \* source\_image.get\_n\_pages()
 \> IMAGE\_BOMB\_TOTAL\_PIXELS
 ):
 raise BadImageError(\_("Image size exceeds limit."))
 else:
 # When thumbnailing image uploads, we truncate thumbnailed
 # animations, so we have different checks for animated vs
 # still images.
 if source\_image.get\_n\_pages() == 1:
 if source\_image.width \* source\_image.height > IMAGE\_BOMB\_TOTAL\_PIXELS:
 raise BadImageError(\_("Image size exceeds limit."))

 else:
 # For animated images, we have an additional limit -- we
 # want to be able to render at least 3 frames, and spend
 # no more than 1/3 of that IMAGE\_BOMB\_TOTAL\_PIXELS budget
 # in doing so.
 if (
 source\_image.width \* source\_image.height \* min(3, source\_image.get\_n\_pages())
 \> IMAGE\_MAX\_ANIMATED\_PIXELS
 ):
 raise BadImageError(\_("Image size exceeds limit."))

 try:
 yield source\_image
 except pyvips.Error as e: # nocoverage
 logging.exception(e)
 raise BadImageError(\_("Image is corrupted or truncated"))

def resize\_avatar(image\_data: bytes, size: int = DEFAULT\_AVATAR\_SIZE) -> bytes:
 # This will scale up, if necessary, and will scale the smallest
 # dimension to fit. That is, a 1x1000 image will end up with the
 # one middle pixel enlarged to fill the full square.
 # The resizing dimensions should be kept in sync with the client-side
 # resizing code in web/upload\_widget.ts.
 with libvips\_check\_image(image\_data):
 return pyvips.Image.thumbnail\_buffer(
 image\_data,
 size,
 height=size,
 crop=pyvips.Interesting.CENTRE,
 ).write\_to\_buffer(".png")

def resize\_realm\_icon(image\_data: bytes) -> bytes:
 return resize\_avatar(image\_data)

def resize\_logo(image\_data: bytes) -> bytes:
 # This will only scale the image down, and will resize it to
 # preserve aspect ratio and be contained within 8\*AVATAR by AVATAR
 # pixels; it does not add any padding to make it exactly that
 # size. A 1000x10 pixel image will end up as 800x8; a 10x10 will
 # end up 10x10.
 # The resizing dimensions should be kept in sync with the client-side
 # resizing code in web/upload\_widget.ts.
 with libvips\_check\_image(image\_data):
 return pyvips.Image.thumbnail\_buffer(
 image\_data,
 8 \* DEFAULT\_AVATAR\_SIZE,
 height=DEFAULT\_AVATAR\_SIZE,
 size=pyvips.Size.DOWN,
 ).write\_to\_buffer(".png")

def resize\_emoji(
 image\_data: bytes, emoji\_file\_name: str, size: int = DEFAULT\_EMOJI\_SIZE
) -\> tuple\[bytes, bytes \| None\]:
 # Square brackets are used for providing options to libvips' save
 # operation; the extension on the filename comes from reversing
 # the content-type, which removes most of the attacker control of
 # this string, but assert it has no bracketed pieces for safety.
 write\_file\_ext = os.path.splitext(emoji\_file\_name)\[1\]
 assert "\[" not in write\_file\_ext\
\
 # This function returns two values:\
 # 1) Emoji image data.\
 # 2) If it is animated, the still image data i.e. first frame of gif.\
 with libvips\_check\_image(image\_data) as source\_image:\
 if source\_image.get\_n\_pages() == 1:\
 # This will crop the image to fit exactly within size x size pixels,\
 # using center cropping to preserve the most important part of the image.\
 # Unlike animated images below, static images are cropped rather\
 # than padded to achieve square dimensions.\
 return (\
 pyvips.Image.thumbnail\_buffer(\
 image\_data,\
 size,\
 height=size,\
 crop=pyvips.Interesting.CENTRE,\
 ).write\_to\_buffer(write\_file\_ext),\
 None,\
 )\
\
 animated = pyvips.Image.thumbnail\_buffer(\
 image\_data,\
 size,\
 height=size,\
 # This is passed to the loader, and means "load all\
 # frames", instead of the default of just the first\
 option\_string="n=-1",\
 )\
 if animated.width != animated.get("page-height"):\
 # If the image is non-square, we have to iterate the\
 # frames to add padding to make it so\
 if not animated.hasalpha():\
 animated = animated.addalpha()\
 frames = \[\
 frame.gravity(\
 pyvips.CompassDirection.CENTRE,\
 size,\
 size,\
 extend=pyvips.Extend.BACKGROUND,\
 background=\[0, 0, 0, 0\],\
 )\
 for frame in animated.pagesplit()\
 \]\
 animated = frames\[0\].pagejoin(frames\[1:\])\
 first\_still = frames\[0\].write\_to\_buffer(".png")\
 else:\
 first\_still = animated.pagesplit()\[0\].write\_to\_buffer(".png")\
 return (animated.write\_to\_buffer(write\_file\_ext), first\_still)\
\
def needs\_transcoded\_format(image\_attachment: ImageAttachment) -> bool:\
 # Images whose content-type browsers can't render inline need a\
 # transcoded, web-safe copy. Some old uploads have a missing\
 # content-type -- null, or empty from a blank ?mimetype= -- which\
 # is falsy here and so judged inline, since we can't tell otherwise.\
 return bool(\
 image\_attachment.content\_type\
 and bare\_content\_type(image\_attachment.content\_type) not in INLINE\_MIME\_TYPES\
 )\
\
def missing\_thumbnails(\
 image\_attachment: ImageAttachment,\
) -\> list\[ThumbnailFormat\]:\
 seen\_thumbnails: set\[StoredThumbnailFormat\] = set()\
 for existing\_thumbnail in image\_attachment.thumbnail\_metadata:\
 seen\_thumbnails.add(StoredThumbnailFormat(\*\*existing\_thumbnail))\
\
 potential\_output\_formats = list(THUMBNAIL\_OUTPUT\_FORMATS)\
 if needs\_transcoded\_format(image\_attachment):\
 if image\_attachment.original\_width\_px >= image\_attachment.original\_height\_px:\
 additional\_format = ThumbnailFormat(\
 TRANSCODED\_IMAGE\_FORMAT.extension,\
 TRANSCODED\_IMAGE\_FORMAT.max\_width,\
 TRANSCODED\_IMAGE\_FORMAT.max\_height,\
 TRANSCODED\_IMAGE\_FORMAT.animated,\
 )\
 else:\
 additional\_format = ThumbnailFormat(\
 TRANSCODED\_IMAGE\_FORMAT.extension,\
 # Swap width and height to make a portrait-oriented version\
 TRANSCODED\_IMAGE\_FORMAT.max\_height,\
 TRANSCODED\_IMAGE\_FORMAT.max\_width,\
 TRANSCODED\_IMAGE\_FORMAT.animated,\
 )\
 potential\_output\_formats.append(additional\_format)\
\
 # We use the shared \`\_\_eq\_\_\` method from BaseThumbnailFormat to\
 # compare between the StoredThumbnailFormat values pulled from the\
 # database, and the ThumbnailFormat values in\
 # THUMBNAIL\_OUTPUT\_FORMATS.\
 needed\_thumbnails = \[\
 thumbnail\_format\
 for thumbnail\_format in potential\_output\_formats\
 if thumbnail\_format not in seen\_thumbnails\
 \]\
\
 if image\_attachment.frames == 1:\
 # We do not generate -anim versions if the source is still\
 needed\_thumbnails = \[\
 thumbnail\_format\
 for thumbnail\_format in needed\_thumbnails\
 if not thumbnail\_format.animated\
 \]\
\
 return needed\_thumbnails\
\
def maybe\_thumbnail(\
 content: bytes \| pyvips.Source,\
 content\_type: str \| None,\
 path\_id: str,\
 realm\_id: int,\
 skip\_events: bool = False,\
) -\> ImageAttachment \| None:\
 if content\_type is None or bare\_content\_type(content\_type) not in THUMBNAIL\_ACCEPT\_IMAGE\_TYPES:\
 # If it doesn't self-report as an image file that we might want\
 # to thumbnail, don't parse the bytes at all.\
 return None\
 try:\
 # This only attempts to read the header, not the full image content\
 with libvips\_check\_image(content, truncated\_animation=True) as image:\
 # "original\_width\_px" and "original\_height\_px" here are\
 # \_as rendered\_, after applying the orientation\
 # information which the image may contain.\
 if (\
 "orientation" in image.get\_fields()\
 and image.get("orientation") >= 5\
 and image.get("orientation") <= 8\
 ):\
 (width, height) = (image.height, image.width)\
 else:\
 (width, height) = (image.width, image.height)\
\
 image\_row = ImageAttachment.objects.create(\
 realm\_id=realm\_id,\
 path\_id=path\_id,\
 original\_width\_px=width,\
 original\_height\_px=height,\
 frames=image.get\_n\_pages(),\
 thumbnail\_metadata=\[\],\
 content\_type=content\_type,\
 )\
 if not skip\_events:\
 # The only reason to skip sending thumbnail events is\
 # during import, when the events are separately\
 # enqueued during message rendering; thumbnailing them\
 # before/during message rendering can cause race\
 # conditions.\
 queue\_event\_on\_commit("thumbnail", {"id": image\_row.id, "path\_id": path\_id})\
 return image\_row\
 except BadImageError:\
 return None\
\
def get\_image\_thumbnail\_path(\
 image\_attachment: ImageAttachment,\
 thumbnail\_format: BaseThumbnailFormat,\
) -\> str:\
 return f"thumbnail/{image\_attachment.path\_id}/{thumbnail\_format!s}"\
\
def split\_thumbnail\_path(file\_path: str) -> tuple\[str, BaseThumbnailFormat\]:\
 assert file\_path.startswith("thumbnail/")\
 path\_parts = file\_path.split("/")\
 thumbnail\_format = BaseThumbnailFormat.from\_string(path\_parts.pop())\
 assert thumbnail\_format is not None\
 path\_id = "/".join(path\_parts\[1:\])\
 return path\_id, thumbnail\_format\
\
@dataclass\
class MarkdownImageMetadata:\
 url: str \| None\
 is\_animated: bool\
 original\_width\_px: int\
 original\_height\_px: int\
 original\_content\_type: str \| None\
 transcoded\_image: StoredThumbnailFormat \| None = None\
\
@dataclass\
class AttachmentData:\
 audio\_path\_ids: set\[str\]\
 image\_metadata: dict\[str, MarkdownImageMetadata\]\
\
def manifest\_and\_get\_user\_upload\_previews(\
 realm\_id: int,\
 content: str,\
 lock: bool = False,\
 enqueue: bool = True,\
 path\_ids: list\[str\] \| None = None,\
) -\> AttachmentData:\
 if path\_ids is None:\
 path\_ids = re.findall(r"/user\_uploads/(\\d+/\[/\\w.-\]+)", content)\
 if not path\_ids:\
 return AttachmentData(\
 audio\_path\_ids=set(),\
 image\_metadata={},\
 )\
\
 image\_metadata: dict\[str, MarkdownImageMetadata\] = {}\
\
 image\_attachments = ImageAttachment.objects.filter(\
 realm\_id=realm\_id, path\_id\_\_in=path\_ids\
 ).order\_by("id")\
 if lock:\
 image\_attachments = image\_attachments.select\_for\_update(of=("self",), no\_key=True)\
 for image\_attachment in image\_attachments:\
 if image\_attachment.thumbnail\_metadata == \[\]:\
 # Image exists, and header of it parsed as a valid image,\
 # but has not been thumbnailed yet; we will render a\
 # spinner.\
 image\_metadata\[image\_attachment.path\_id\] = MarkdownImageMetadata(\
 url=None,\
 is\_animated=False,\
 original\_width\_px=image\_attachment.original\_width\_px,\
 original\_height\_px=image\_attachment.original\_height\_px,\
 original\_content\_type=image\_attachment.content\_type,\
 )\
\
 # We re-queue the row for thumbnailing to make sure that\
 # we do eventually thumbnail it (e.g. if this is a\
 # historical upload from before this system, which we\
 # backfilled ImageAttachment rows for); this is a no-op in\
 # the worker if all of the currently-configured thumbnail\
 # formats have already been generated.\
 if enqueue:\
 queue\_event\_on\_commit(\
 "thumbnail", {"id": image\_attachment.id, "path\_id": image\_attachment.path\_id}\
 )\
 else:\
 url, is\_animated = get\_default\_thumbnail\_url(image\_attachment)\
 image\_metadata\[image\_attachment.path\_id\] = MarkdownImageMetadata(\
 url=url,\
 is\_animated=is\_animated,\
 original\_width\_px=image\_attachment.original\_width\_px,\
 original\_height\_px=image\_attachment.original\_height\_px,\
 original\_content\_type=image\_attachment.content\_type,\
 transcoded\_image=get\_transcoded\_format(image\_attachment),\
 )\
\
 non\_image\_path\_ids = \[path\_id for path\_id in path\_ids if image\_metadata.get(path\_id) is None\]\
 non\_image\_attachments = Attachment.objects.filter(\
 realm\_id=realm\_id, path\_id\_\_in=non\_image\_path\_ids\
 ).order\_by("id")\
 audio\_path\_ids = {\
 attachment.path\_id\
 for attachment in non\_image\_attachments\
 if attachment.content\_type\
 and bare\_content\_type(attachment.content\_type) in AUDIO\_INLINE\_MIME\_TYPES\
 }\
\
 return AttachmentData(\
 audio\_path\_ids=audio\_path\_ids,\
 image\_metadata=image\_metadata,\
 )\
\
def get\_default\_thumbnail\_url(image\_attachment: ImageAttachment) -> tuple\[str, bool\]:\
 # For "dumb" clients which cannot rewrite it into their\
 # preferred format and size, we choose the first one in\
 # THUMBNAIL\_OUTPUT\_FORMATS which matches the animated/not\
 # nature of the source image.\
 found\_format: ThumbnailFormat \| None = None\
 for thumbnail\_format in THUMBNAIL\_OUTPUT\_FORMATS:\
 if thumbnail\_format.animated == (image\_attachment.frames > 1):\
 found\_format = thumbnail\_format\
 break\
 if found\_format is None:\
 # No animated thumbnail formats exist somehow, and the\
 # image is animated? Just take the first thumbnail\
 # format.\
 found\_format = THUMBNAIL\_OUTPUT\_FORMATS\[0\]\
 return (\
 "/user\_uploads/" + get\_image\_thumbnail\_path(image\_attachment, found\_format),\
 found\_format.animated,\
 )\
\
def get\_transcoded\_format(\
 image\_attachment: ImageAttachment,\
) -\> StoredThumbnailFormat \| None:\
 # Returns None if the original content-type is judged to be\
 # renderable inline. Otherwise, we return the largest thumbnail\
 # that we generated. Since formats which are thumbnailable but\
 # not in INLINE\_MIME\_TYPES get an extra large-resolution thumbnail\
 # added to their list of formats, this is thus either None or a\
 # high-resolution thumbnail.\
 if not needs\_transcoded\_format(image\_attachment):\
 return None\
\
 thumbs\_by\_size = sorted(\
 (StoredThumbnailFormat(\*\*d) for d in image\_attachment.thumbnail\_metadata),\
 key=lambda t: t.width \* t.height,\
 )\
 return thumbs\_by\_size.pop() if thumbs\_by\_size else None\
\
\# Like HTMLFormatter.REGISTRY\["html5"\], this formatter avoids producing\
\# self-closing tags, but it differs by avoiding unnecessary escaping with\
\# HTML5-specific entities that cannot be parsed by lxml and libxml2\
\# (https://bugs.launchpad.net/lxml/+bug/2031045).\
html\_formatter = HTMLFormatter(\
 entity\_substitution=EntitySubstitution.substitute\_xml, # not substitute\_html\
 void\_element\_close\_prefix="",\
 empty\_attributes\_are\_booleans=True,\
)\
\
def process\_inline\_images\_to\_thumbnails(\
 placeholder\_image\_tag: Tag \| None,\
 path\_id: str,\
 image\_data: MarkdownImageMetadata \| None,\
 to\_delete: set\[str\] \| None,\
 inline\_image\_div: Tag \| None = None,\
 image\_link: Tag \| None = None,\
) -\> tuple\[bool, str \| None\]:\
 if placeholder\_image\_tag is None:\
 # We have a link-based image\
\
, but\
 # the image is not a placeholder.\
 assert image\_link is not None\
 full\_res\_image\_tag = image\_link.find("img", src=image\_link\["href"\])\
 assert full\_res\_image\_tag is None or isinstance(full\_res\_image\_tag, Tag)\
 if full\_res\_image\_tag is not None and image\_data is not None:\
 # The  element has the same src as the link,\
 # which means this is an older, non-thumbnailed\
 # version. Let's replace the image with a spinner,\
 # and mark it as a pending thumbnail.\
 full\_res\_image\_tag\["src"\] = "/static/images/loading/loader-black.svg"\
 full\_res\_image\_tag\["class"\] = "image-loading-placeholder"\
 full\_res\_image\_tag\["data-original-dimensions"\] = (\
 f"{image\_data.original\_width\_px}x{image\_data.original\_height\_px}"\
 )\
 if image\_data.original\_content\_type:\
 full\_res\_image\_tag\["data-original-content-type"\] = image\_data.original\_content\_type\
\
 return True, path\_id\
\
 # The placeholder was already replaced -- for instance,\
 # this is expected if multiple images are included in the\
 # same message. The second time this is run, for the\
 # second image, the first image will have no placeholder.\
 return False, None\
\
 if to\_delete and path\_id in to\_delete:\
 # This was not a valid thumbnail target, for some reason.\
 # Trim out the whole "message\_inline\_image" div, or the "image"\
 # element, since it's not going be renderable by clients\
 # either.\
 if inline\_image\_div is not None:\
 inline\_image\_div.decompose()\
 else:\
 assert placeholder\_image\_tag is not None\
 placeholder\_image\_tag.decompose()\
\
 return True, None\
\
 if image\_data is None:\
 # The message has multiple images, and we're updating just\
 # one image, and it's not this one. Leave this one as-is.\
 return False, path\_id\
 elif image\_data.url is None:\
 # We're re-rendering the whole message, so fetched all of the\
 # image metadata rows; this is one of the images we care\
 # about, but is not thumbnailed yet.\
 return False, path\_id\
\
 # This is a placeholder for an image which we now have a thumbnail\
 # for; replace the placeholder with the thumbnailed image.\
\
 del placeholder\_image\_tag\["class"\]\
\
 if inline\_image\_div is None:\
 # This is for \`!\[...\](...)\` images, which don't have a div.\
 placeholder\_image\_tag\["class"\] = "inline-image"\
\
 placeholder\_image\_tag\["src"\] = image\_data.url\
 placeholder\_image\_tag\["data-original-dimensions"\] = (\
 f"{image\_data.original\_width\_px}x{image\_data.original\_height\_px}"\
 )\
 if image\_data.original\_content\_type is not None:\
 placeholder\_image\_tag\["data-original-content-type"\] = image\_data.original\_content\_type\
 if image\_data.is\_animated:\
 placeholder\_image\_tag\["data-animated"\] = "true"\
 if image\_data.transcoded\_image is not None:\
 placeholder\_image\_tag\["data-transcoded-image"\] = str(image\_data.transcoded\_image)\
\
 return True, None\
\
def process\_link\_inline\_images\_to\_thumbnails(\
 images: dict\[str, MarkdownImageMetadata\],\
 to\_delete: set\[str\] \| None,\
 inline\_image\_div: Tag,\
) -\> tuple\[bool, str \| None\] \| None:\
 """This handles inline thumbnail images from \[...\](...) links."""\
 image\_link = inline\_image\_div.find("a")\
 if (\
 not isinstance(image\_link, Tag)\
 or image\_link.get("href") is None\
 or not isinstance(image\_link\["href"\], str)\
 or not image\_link\["href"\].startswith("/user\_uploads/")\
 ):\
 # This is not an inline image generated by the markdown\
 # processor for a locally-uploaded image.\
 return None\
\
 path\_id = image\_link\["href"\].removeprefix("/user\_uploads/")\
 image\_data = images.get(path\_id)\
 placeholder\_image\_tag = image\_link.find("img", class\_="image-loading-placeholder")\
\
 assert placeholder\_image\_tag is None or isinstance(placeholder\_image\_tag, Tag)\
\
 return process\_inline\_images\_to\_thumbnails(\
 placeholder\_image\_tag,\
 path\_id,\
 image\_data,\
 to\_delete,\
 inline\_image\_div,\
 image\_link,\
 )\
\
def rewrite\_thumbnailed\_images(\
 rendered\_content: str,\
 images: dict\[str, MarkdownImageMetadata\],\
 to\_delete: set\[str\] \| None = None,\
) -\> tuple\[str \| None, set\[str\]\]:\
 if not images and not to\_delete:\
 return None, set()\
\
 remaining\_thumbnails = set()\
 parsed\_message = BeautifulSoup(rendered\_content, "html.parser")\
\
 changed = False\
\
 # Loading placeholder images for previews of linked images (i.e., \`\[...\](...)\`, with no \`!\`) use this code path.\
 for inline\_image\_div in parsed\_message.find\_all("div", class\_="message\_inline\_image"):\
 processed\_results = process\_link\_inline\_images\_to\_thumbnails(\
 images, to\_delete, inline\_image\_div\
 )\
\
 if processed\_results is None:\
 continue\
\
 image\_changed, unthumbnailed\_path\_id = processed\_results\
\
 changed \|= image\_changed\
\
 if unthumbnailed\_path\_id is not None:\
 remaining\_thumbnails.add(unthumbnailed\_path\_id)\
\
 # Loading placeholder images for \`!\[...\](...)\` style images\
 for inline\_placeholder\_image in parsed\_message.find\_all(\
 "img", class\_="inline-image image-loading-placeholder"\
 ):\
 image\_src = inline\_placeholder\_image.get("data-original-src")\
\
 assert image\_src is not None\
\
 path\_id = image\_src.removeprefix("/user\_uploads/")\
 image\_data = images.get(path\_id)\
\
 image\_changed, unthumbnailed\_path\_id = process\_inline\_images\_to\_thumbnails(\
 inline\_placeholder\_image, path\_id, image\_data, to\_delete\
 )\
\
 changed \|= image\_changed\
\
 if unthumbnailed\_path\_id is not None:\
 remaining\_thumbnails.add(unthumbnailed\_path\_id)\
\
 if changed:\
 return (\
 parsed\_message.encode(formatter=html\_formatter).decode().strip(),\
 remaining\_thumbnails,\
 )\
 else:\
 return None, remaining\_thumbnails