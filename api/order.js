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
    } catch (error) {
      console.error('BODY PARSE ERROR:', error instanceof Error ? error.message : error);
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

  console.log('TRACK REQUEST URL:', url);
  console.log('TRACK REQUEST HEADERS:', headers);

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers,
  });

  console.log('TRACK RESPONSE STATUS:', response.status);

  if (!response.ok) {
    throw new Error(`Track request failed with status ${response.status}`);
  }

  const trackId = (await response.text()).trim();

  console.log('TRACK RESPONSE BODY:', trackId);

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

  const bodyToSend = buildQuery(params);

  console.log('PP REQUEST HEADERS:', headers);
  console.log('PP REQUEST BODY:', bodyToSend);

  const response = await fetch(api.save_url, {
    method: 'POST',
    redirect: 'follow',
    headers,
    body: bodyToSend,
  });

  const rawText = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }

  console.log('PP RESPONSE STATUS:', response.status);
  console.log('PP RESPONSE RAW:', rawText);

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

  console.log('CAPI REQUEST PIXEL:', pixel);
  console.log('CAPI TOKEN EXISTS:', !!token);
  console.log('CAPI REQUEST PAYLOAD:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      access_token: token
    })
  });

  const rawText = await response.text();

  console.log('CAPI RESPONSE STATUS:', response.status);
  console.log('CAPI RESPONSE RAW:', rawText);
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

    console.log('===== ORDER REQUEST START =====');
    console.log('REQUEST METHOD:', req.method);
    console.log('REQUEST URL:', req.url);
    console.log('INCOMING BODY:', JSON.stringify(body, null, 2));
    console.log('INCOMING HEADERS:', JSON.stringify({
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
    }, null, 2));

    console.log('META DEBUG pixel:', body.pixel);
    console.log('META DEBUG token exists:', !!PIXELS[str(body.pixel).trim()]?.token);

    const name = str(body.name).trim();
    const phone = str(body.phone).trim();

    console.log('EXTRACTED FIELDS:', JSON.stringify({
      name,
      phone,
      sub1: str(body.sub1).trim(),
      sub2: str(body.sub2).trim(),
      sub3: str(body.sub3).trim(),
      sub4: str(body.sub4).trim(),
      sub5: str(body.sub5).trim(),
      ip: str(body.ip).trim(),
      ua: str(body.ua).trim(),
      pixel: str(body.pixel).trim(),
      fbp: str(body.fbp).trim(),
      fbc: str(body.fbc).trim(),
      other: str(body.other).trim(),
    }, null, 2));

    if (!name) {
      console.error('VALIDATION ERROR: Name is required');
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }

    if (!phone) {
      console.error('VALIDATION ERROR: Phone is required');
      return res.status(400).json({
        success: false,
        message: 'Phone is required',
      });
    }

    const params = buildBaseParams(body, req);

    console.log('BASE PARAMS:', JSON.stringify(params, null, 2));

    const trackId = await requestTrackId(params);
    params.track_id = trackId;

    const signString = buildQuery(params) + api.secret;
    params.sign = sha1(signString);

    console.log('FINAL PARAMS BEFORE PP:', JSON.stringify(params, null, 2));

    const partnerResult = await sendLead(params);

    console.log('PARTNER RESULT:', JSON.stringify({
      http_status: partnerResult.http_status,
      ok: partnerResult.ok,
      data: partnerResult.data,
      raw: partnerResult.raw,
    }, null, 2));

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
      } else {
        console.log('CAPI SKIPPED: No pixel config found for pixel', pixel);
      }
    } else {
      console.log('CAPI SKIPPED: Partner response is not OK');
    }

    console.log('===== ORDER REQUEST SUCCESS =====');

    return res.status(200).json({
      success: true,
      message: 'Lead sent',
      track_id: trackId,
      partner_status: partnerResult.http_status,
      partner_response: partnerResult.data
    });

  } catch (error) {
    console.error('===== ORDER REQUEST ERROR =====');
    console.error('ERROR MESSAGE:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('ERROR STACK:', error.stack);
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
