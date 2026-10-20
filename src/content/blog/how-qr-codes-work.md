---
title: "How QR Codes Work: What Fits, What Breaks, and How to Make Them Scan"
slug: how-qr-codes-work
category: graphics-media
description: A practical guide to QR code structure, error correction, payload size, contrast, quiet space, and the design choices that make codes scan reliably.
excerpt: QR codes can recover from damage, but they are not magic containers. Learn what fits cleanly, what gets too dense, and how to avoid hard-to-scan designs.
tags: [qr-codes, error-correction, image-tools, wifi, design]
author: NeatSize
publishDate: 2026-10-20
difficulty: beginner
seoTitle: How QR Codes Work and Scan Reliably
metaDescription: Learn how QR codes work, how error correction changes size, and why contrast, quiet space, and payload length affect scanning.
relatedTools: [qr-code-generator, url-encoder-decoder, base64-encoder-decoder]
---

## The short version: a QR code is a data grid with built-in recovery

A QR code stores data as a grid of black and white modules, not as a picture of the text, URL, or Wi‑Fi password inside it. A scanner reads the grid, finds the code structure, then decodes the data from the module pattern.

The parts that make that possible are not decoration. The three large squares in the corners are finder patterns; they tell the camera where the QR code is and how it is rotated. Timing patterns help the reader count rows and columns. The blank border around the outside, called the quiet zone, separates the code from nearby text, borders, photos, or packaging graphics.

QR codes also include error correction. That means the scanner can still recover the message if part of the code is dirty, scratched, slightly blurred, or covered by a small logo. The tradeoff is size: more recovery data means less room for your payload at the same grid size, so the generator may need a denser code with more modules.

If you want to try a URL, Wi‑Fi login, contact card, or text payload, use the [QR Code Generator](/tool/qr-code-generator). It runs in your browser, which is handy for private payloads such as Wi‑Fi passwords.

The practical point: readability depends on structure. A code can look sharp on your screen and still fail if the modules are too tiny, the border is missing, or the contrast is weak.

## Error correction is the tradeoff that changes code size

QR code error correction is usually offered in four levels. The names vary by generator, but they map to the same idea: lower levels store less recovery data; higher levels store more.

| Level | Common label | Approximate recovery | Use it for |
|---|---:|---:|---|
| L | Low | About 7% | Clean screens, large codes, short URLs |
| M | Medium | About 15% | General use where the code is not abused |
| Q | Quartile | About 25% | Printed materials, light wear, small styling |
| H | High | About 30% | Logos, rough surfaces, codes likely to be damaged |

Higher correction helps when the real world gets messy. A code on a coffee cup curves away from the camera. A code on a flyer may be printed with soft edges. A code on packaging may pick up glare, scuffs, folds, or dirt. In those cases, Q or H can give the scanner enough redundancy to reconstruct the payload.

That protection is not free. If the content is short, the difference may be invisible. If the content is already long, higher correction can push the QR code into a larger version with more rows and columns. More modules in the same physical space means each module gets smaller. At some point, the camera and printer cannot separate them cleanly, and scanning becomes less reliable even though the error correction setting is higher.

Error correction also cannot fix a badly designed code. A high-correction QR with pale gray modules on a beige background, no quiet zone, and a long payload can still fail. The same goes for a code that has been stretched into a rectangle or cropped to fit a layout.

A useful rule: use higher correction for physical-world codes, especially if you add a logo or expect wear, but do not treat it as a substitute for contrast, margin, and an appropriate printed size.

## What you can encode: URLs, Wi‑Fi, contacts, email, phone, SMS, and plain text

Different QR code types are not only different labels in a generator. Each has its own payload format. A URL stores a web address. A Wi‑Fi code stores a network name, security type, and password in a format phones understand. A vCard stores contact fields. Email, phone, and SMS payloads follow their own compact patterns.

URLs are usually the safest default. A short web link scans quickly, stays readable at smaller sizes, and can point to a page that contains anything else: a menu, form, PDF, coupon, setup guide, event page, or contact details. If the destination content changes, you can update the page instead of reprinting every poster or package, as long as the URL itself stays valid.

Wi‑Fi QR codes are convenient because they save people from typing long passwords. A typical payload includes the SSID, the authentication type such as WPA, and the password. Hidden networks, unusual characters, or nonstandard setups can be finicky across devices, so test before printing a batch of labels. If the password contains punctuation, make sure the generator escapes it correctly rather than pasting a hand-written format from somewhere else.

Contact cards are useful, but vCards get large fast. A name and phone number make a compact code. Add a company, title, address, website, multiple numbers, notes, and social links, and the grid can become dense. For business cards, a short URL to a contact page often scans better than stuffing every field into the QR itself.

Plain text is the most direct option for short messages, asset labels, coupon codes, inventory IDs, or short instructions. It becomes a poor choice for long paragraphs. A full document, a long JSON blob, or a base64 payload can technically fit in some QR codes, but the result is often ugly, dense, and unforgiving to print quality. If you are checking encoded strings, the [Base64 Encoder / Decoder](/tool/base64-encoder-decoder) can help you see how much bulk you are adding before you turn it into a QR code.

For common formats, start with the [QR Code Generator](/tool/qr-code-generator) and choose the payload type first rather than forcing everything into plain text.

## Why some QR codes scan instantly and others fail

The fastest-scanning QR codes tend to be boring: dark modules, light background, clean square shape, and enough empty space around the edges. Those traits matter more than most styling choices.

Contrast comes first. Black on white is the safest because cameras and QR readers are tuned for it. Dark blue on white, dark green on white, or near-black on a pale background can work. Pale colors, low-contrast palettes, transparent backgrounds over photos, and reversed codes with light modules on dark backgrounds are riskier. Some apps handle reversed colors; others do not.

Quiet space is next. The blank border around the code should remain clear. If a designer places text, icons, patterns, or a border right against the modules, the scanner may misread where the QR code starts and ends. A good-looking frame can still interfere if it crowds the code.

Scale matters more than people expect. A QR code that scans perfectly on a laptop screen may fail when printed as a 15 mm sticker, especially if the payload is long. Dense codes need more physical space because each module has to remain distinct after printing, lighting, camera focus, and motion are all involved. Screens can introduce problems too: glare, low brightness, cracked glass, and tiny display size all reduce reliability.

Logos and decorative styling can be acceptable, but only with room to spare. Keep the logo away from the finder patterns, use enough error correction, and test the final design. Rounded modules, gradients, shadows, and cutouts all reduce scanner confidence. One or two styling choices may work; stacking several effects is where failures appear.

Never stretch a QR code to fit a non-square space. Scaling uniformly is fine, but dragging only the width or height changes the module geometry. Cropping is also dangerous because it can remove the quiet zone or part of the data grid. If the layout needs a different size, regenerate or place the square code into a larger design.

Before printing packaging, signage, menus, or posters, test the final code on more than one phone, at the intended size, under realistic lighting. A successful scan from a large preview on your monitor is not enough.

## How to choose the right payload size before you generate

Start with the shortest useful payload, not the raw text you happen to have. For most public uses, that means a concise URL. For contacts, include the fields people need most rather than every possible detail. For Wi‑Fi, use the exact network name and password, with no extra labels or copied formatting.

Shorter content usually means fewer modules. Fewer modules make each square larger at the same print size, which improves scan reliability. It also gives you more room for a logo or a custom color choice if the design needs one.

Encoding overhead can surprise you. Tracking parameters, long query strings, pasted line breaks, smart quotes, escaped characters, and copied formatting can all make the payload longer than expected. A URL with many parameters may turn into a dense QR even if the visible page address looks manageable. If you need to inspect or clean a link, use the [URL Encoder / Decoder](/tool/url-encoder-decoder) to see what characters are encoded and remove anything unnecessary.

Check the finished QR code at the size people will use. If it will be printed 25 mm wide on a product tag, test a 25 mm printout. If it will appear on a poster across a room, test from that distance. On-screen preview size is often misleading because the browser may display the code much larger than the final item.

The workflow is simple: trim first, generate second, test third. Repeating generation from a bloated payload wastes time and often leads to a code that only works under ideal conditions.

## When not to use a QR code at all

Do not put secrets in a QR code unless you are comfortable with them being photographed, forwarded, stored in camera rolls, or scanned by anyone nearby. Wi‑Fi passwords are common because they are meant to be shared in a controlled space, but one-time credentials, private tokens, recovery codes, and admin links are poor candidates for printed QR codes.

QR codes are also a bad fit for long content. The more data you pack in, the denser the grid becomes. Dense codes need better printing, better lighting, steadier hands, and more capable cameras. If the content is a document, publish the document somewhere and encode a short link instead.

Avoid QR codes when a human needs to read, edit, or type the data. A serial number, safety instruction, dosage note, address, or deadline should appear as readable text. The QR code can supplement it, but it should not be the only way to access essential information.

Static printed codes create maintenance problems when destinations change often. If you print a direct link to a file that may move next month, the printed code will age badly. Use a stable URL you control, or avoid printing until the destination is settled.

Accessibility matters too. A QR code is not a replacement for labels, instructions, or contact information. Some people cannot scan it easily, some devices block camera access, and some environments have poor connectivity. Treat the code as a shortcut, not the only path.