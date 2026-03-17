import crypto from 'node:crypto';

const api = {
  key: '8456',
  secret: '4e415ea2ed6765f4e8a14f710920035f',
  flow_url: 'https://leadrock.com/URL-GXFQ6-S8GZV',
  save_url: 'https://leadrock.com/api/v2/lead/save',
};

// ===== PIXEL CONFIG =====
const PIXELS = {
  "1490866115735262": {
    token: process.env.META_TOKEN_1490866115735262
  }
};

// ===== HELPERS =====
function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function str(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function getBody(req) {
  if (!req.body) return {};

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.append(key, str(value));
  }

  return searchParams.toString();
}

function getClientIp(req, body) {
  if (body.ip) return str(body.ip).trim();

  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim();
  }

  return '';
}

function getUserAgent(req, body) {
  if (body.ua) return str(body.ua).trim();

  const userAgent = req.headers['user-agent'];
  if (typeof userAgent === 'string') {
    return userAgent.trim();
  }

  return '';
}

// ===== BASE PARAMS =====
function buildBaseParams(body, req) {
  return {
    flow_url: api.flow_url,
    user_phone: str(body.phone).trim(),
    user_name: str(body.name).trim(),
    other: str(body.other).trim(),
    ip: getClientIp(req, body),
    ua: getUserAgent(req, body),
    api_key: api.key,
    sub1: str(body.sub1).trim(),
    sub2: str(body.sub2).trim(),
    sub3: str(body.sub3).trim(),
    sub4: str(body.sub4).trim(),
    sub5: str(body.sub5).trim(),
    ajax: '1',
  };
}

// ===== TRACK ID =====
async function requestTrackId(params) {
  const query = buildQuery(params);
  const separator = api.flow_url.includes('?') ? '&' : '?';
  const url = `${api.flow_url}${separator}${query}`;

  const headers = {};
  if (params.ua) headers['user-agent'] = params.ua;

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Track request failed with status ${response.status}`);
  }

  const trackId = (await response.text()).trim();

  if (!trackId) {
    throw new Error('Empty track_id received');
  }

  return trackId;
}

// ===== SEND TO PP =====
async function sendLead(params) {
  const headers = {
    'content-type': 'application/x-www-form-urlencoded',
  };

  if (params.ua) {
    headers['user-agent'] = params.ua;
  }

  const response = await fetch(api.save_url, {
    method: 'POST',
    redirect: 'follow',
    headers,
    body: buildQuery(params),
  });

  const rawText = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }

  return {
    http_status: response.status,
    ok: response.ok,
    data: parsed,
    raw: rawText,
  };
}

// ===== SEND TO META =====
async function sendCAPI({ pixel, token, body, params }) {
  if (!pixel || !token) return;

  const url = `https://graph.facebook.com/v18.0/${pixel}/events`;

  const phone = normalizePhone(str(body.phone));
  const name = normalizeName(str(body.name));

  const payload = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",

        user_data: {
          client_ip_address: params.ip,
          client_user_agent: params.ua,
          fbp: body.fbp || "",
          fbc: body.fbc || "",
          ph: phone ? sha256(phone) : undefined,
          fn: name ? sha256(name) : undefined
        }
      }
    ]
  };

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      access_token: token
    })
  });
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed',
    });
  }

  try {
    const body = getBody(req);

    console.log('META DEBUG pixel:', body.pixel);
    console.log('META DEBUG token exists:', !!PIXELS[str(body.pixel).trim()]?.token);

    const name = str(body.name).trim();
    const phone = str(body.phone).trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required',
      });
    }

    const params = buildBaseParams(body, req);

    const trackId = await requestTrackId(params);
    params.track_id = trackId;

    const signString = buildQuery(params) + api.secret;
    params.sign = sha1(signString);

    const partnerResult = await sendLead(params);

    // ===== CAPI =====
    if (partnerResult.ok) {
      const pixel = str(body.pixel).trim();
      const pixelConfig = PIXELS[pixel];

      if (pixelConfig) {
        await sendCAPI({
          pixel,
          token: pixelConfig.token,
          body,
          params
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Lead sent',
      track_id: trackId,
      partner_status: partnerResult.http_status,
      partner_response: partnerResult.data
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
