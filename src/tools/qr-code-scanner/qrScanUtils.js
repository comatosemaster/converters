// -----------------------------------------------------------------------
// QR SCANNING LOGIC - no React. Decoding is done by jsQR (loaded on
// demand); this file adds the parts that make it reliable on real photos,
// and turns the decoded text into something readable (a WiFi network, a
// contact, a link...) - the same payload formats our QR Code Generator
// writes (see qr-code-generator/qrPayloads.js).
// -----------------------------------------------------------------------

let jsQRPromise = null;
function loadJsQR() {
  if (!jsQRPromise) jsQRPromise = import('jsqr').then((m) => m.default);
  return jsQRPromise;
}

// jsQR works on raw pixels and its speed scales with image size. A QR code
// in a 12-megapixel photo is found faster - and often more reliably, since
// downscaling averages away sensor noise - in a smaller copy; a tiny code
// in a big photo needs a larger one. So several sizes are tried, most
// likely first, and the first hit wins.
const SCAN_SIZES = [1000, 1600, 600, 2400, 350];

function pixelsAt(source, sourceWidth, sourceHeight, longestSide) {
  const scale = Math.min(1, longestSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Transparent PNG codes would otherwise sit on "black" transparent pixels.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return { data: ctx.getImageData(0, 0, width, height).data, width, height, scale };
}

// Scans a still image (an <img>, ImageBitmap or canvas). Returns
// { text, corners } with corners in the source's own pixel coordinates, or
// null if no QR code was found at any size.
export async function scanImage(source, sourceWidth, sourceHeight) {
  const jsQR = await loadJsQR();
  const tried = new Set();
  for (const size of SCAN_SIZES) {
    const effective = Math.min(size, Math.max(sourceWidth, sourceHeight));
    if (tried.has(effective)) continue;
    tried.add(effective);
    const { data, width, height, scale } = pixelsAt(source, sourceWidth, sourceHeight, effective);
    // 'attemptBoth' also finds light-on-dark (inverted) codes.
    const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data !== '') {
      const corner = (p) => ({ x: p.x / scale, y: p.y / scale });
      const loc = code.location;
      return {
        text: code.data,
        corners: [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner].map(corner),
      };
    }
  }
  return null;
}

// One quick attempt on a video frame - called many times a second while the
// camera is live, so it uses a single modest size and skips the inverted
// pass (the next frame gets another chance anyway).
export async function scanFrame(video) {
  const jsQR = await loadJsQR();
  const { data, width, height } = pixelsAt(video, video.videoWidth, video.videoHeight, 720);
  const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  return code && code.data !== '' ? code.data : null;
}

// --- Understanding what was scanned ------------------------------------------------

// WIFI:T:WPA;S:name;P:secret;; - values may contain backslash-escaped
// \; \, \: \\ characters.
function parseWifi(text) {
  const fields = {};
  const body = text.slice(5);
  let key = '';
  let value = '';
  let inKey = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      if (inKey) key += body[++i];
      else value += body[++i];
    } else if (inKey && ch === ':') {
      inKey = false;
    } else if (!inKey && ch === ';') {
      fields[key.toUpperCase()] = value;
      key = '';
      value = '';
      inKey = true;
    } else if (inKey) {
      key += ch;
    } else {
      value += ch;
    }
  }
  return fields;
}

function parseVcard(text) {
  const get = (name) => {
    const match = text.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'im'));
    return match ? match[1].trim().replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ') : '';
  };
  const n = get('N').split(';');
  return {
    name: get('FN') || [n[1], n[0]].filter(Boolean).join(' '),
    org: get('ORG').replace(/;/g, ', '),
    title: get('TITLE'),
    phone: get('TEL'),
    email: get('EMAIL'),
    url: get('URL'),
    address: get('ADR').split(';').filter(Boolean).join(', '),
  };
}

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// Returns { type, label, fields: [[name, value]], action?: { href, label } }.
// Links are never opened automatically - the page shows where they lead
// first, because a QR code is an easy way to disguise a malicious link.
export function describePayload(text) {
  const trimmed = text.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    let host = '';
    try {
      host = new URL(trimmed).hostname;
    } catch {
      /* not a parseable URL - still show it as text below */
    }
    if (host) {
      return {
        type: 'url',
        label: 'Website link',
        fields: [['Goes to', host], ['Full address', trimmed]],
        action: { href: trimmed, label: `Open ${host}` },
      };
    }
  }

  if (/^WIFI:/i.test(trimmed)) {
    const wifi = parseWifi(trimmed);
    const security = { WPA: 'WPA/WPA2/WPA3', WEP: 'WEP', nopass: 'None (open network)', '': 'None (open network)' }[wifi.T ?? ''] ?? wifi.T;
    const fields = [['Network name', wifi.S ?? ''], ['Security', security]];
    if (wifi.P) fields.push(['Password', wifi.P]);
    if (wifi.H === 'true') fields.push(['Hidden network', 'Yes']);
    return { type: 'wifi', label: 'WiFi network', fields };
  }

  if (/^mailto:/i.test(trimmed)) {
    const [address, query = ''] = trimmed.slice(7).split('?');
    const params = new URLSearchParams(query);
    const fields = [['To', safeDecode(address)]];
    if (params.get('subject')) fields.push(['Subject', params.get('subject')]);
    if (params.get('body')) fields.push(['Message', params.get('body')]);
    return { type: 'email', label: 'Email', fields, action: { href: trimmed, label: 'Write this email' } };
  }

  if (/^MATMSG:/i.test(trimmed)) {
    const pick = (k) => (trimmed.match(new RegExp(`${k}:([^;]*)`, 'i')) || [])[1] || '';
    return {
      type: 'email',
      label: 'Email',
      fields: [['To', pick('TO')], ['Subject', pick('SUB')], ['Message', pick('BODY')]].filter(([, v]) => v),
    };
  }

  if (/^tel:/i.test(trimmed)) {
    return { type: 'phone', label: 'Phone number', fields: [['Number', trimmed.slice(4)]], action: { href: trimmed, label: 'Call' } };
  }

  if (/^(smsto|sms):/i.test(trimmed)) {
    const rest = trimmed.replace(/^(smsto|sms):/i, '');
    const [number, ...message] = rest.split(':');
    const fields = [['To', number]];
    if (message.join(':')) fields.push(['Message', message.join(':')]);
    return { type: 'sms', label: 'Text message', fields };
  }

  if (/^geo:/i.test(trimmed)) {
    const [lat, lng] = trimmed.slice(4).split(/[,;?]/).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        type: 'geo',
        label: 'Map location',
        fields: [['Latitude', String(lat)], ['Longitude', String(lng)]],
        action: { href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`, label: 'Show on map' },
      };
    }
  }

  if (/^BEGIN:VCARD/i.test(trimmed)) {
    const card = parseVcard(trimmed);
    const fields = [
      ['Name', card.name],
      ['Organization', card.org],
      ['Job title', card.title],
      ['Phone', card.phone],
      ['Email', card.email],
      ['Website', card.url],
      ['Address', card.address],
    ].filter(([, v]) => v);
    return { type: 'contact', label: 'Contact card', fields };
  }

  if (/^BEGIN:VEVENT/i.test(trimmed) || /^BEGIN:VCALENDAR/i.test(trimmed)) {
    const pick = (k) => (trimmed.match(new RegExp(`^${k}[^:]*:(.*)$`, 'im')) || [])[1]?.trim() || '';
    return {
      type: 'event',
      label: 'Calendar event',
      fields: [['Event', pick('SUMMARY')], ['Starts', pick('DTSTART')], ['Ends', pick('DTEND')], ['Location', pick('LOCATION')]].filter(([, v]) => v),
    };
  }

  return { type: 'text', label: 'Text', fields: [] };
}
