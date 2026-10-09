# URL Shortener

A service that turns a long web address into a short one and sends visitors who open the short address on to the original. Registered users own the short addresses they create.

## Language

**Link**:
A saved pairing of a short code and a long URL, owned by one user. Can be active, deactivated, or expired.
_Avoid_: Short URL (as the stored thing), shortlink, record

**Long URL**:
The original `http` or `https` web address that a link points to.
_Avoid_: Target, destination, original link

**Short code**:
The short identifier that sits in the path of a link's short address and is unique across all links.
_Avoid_: Slug, key, hash, id

**Generated code**:
A short code the service picks at random when the user doesn't supply one.
_Avoid_: Auto code, random slug

**Custom alias**:
A short code the user chooses themselves instead of a generated code. Shares one namespace with generated codes.
_Avoid_: Vanity URL, custom slug

**Reserved word**:
A short code that is never allowed because it would collide with the service's own routes.
_Avoid_: Blocked alias, banned word

**Owner**:
The user who created a link and is the only one allowed to read or change it.
_Avoid_: Creator, author, account

**Redirect**:
A visitor opening a short address and being sent on to the long URL. Temporary, never permanent.
_Avoid_: Resolve, lookup, hit

**Click**:
A record that a redirect happened, with its time, referrer and user agent.
_Avoid_: Visit, view, hit

**Deactivated link**:
A link its owner turned off. It no longer redirects, and looks the same to visitors as a link that doesn't exist.
_Avoid_: Disabled link, paused link

**Expired link**:
A link whose expiry date has passed. It no longer redirects, and visitors can tell it apart from one that never existed.
_Avoid_: Dead link, stale link
