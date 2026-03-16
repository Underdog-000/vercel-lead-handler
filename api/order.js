import crypto from 'node:crypto';

const api = {
  key: '8456',
  secret: '4e415ea2ed6765f4e8a14f710920035f',
  flow_url: 'https://leadrock.com/URL-GXFQ6-S8GZV',
};

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function toStringValue(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function getRequestBody(req) {
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

function getClientIp(req, body) {
  if (body.ip) return toStringValue(body.ip);

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
  if (body.ua) return toStringValue(body.ua);

  const userAgent = req.headers['user-agent'];
  if (typeof userAgent === 'string') {
    return userAgent;
  }

  return '';
}

function buildParams(body, req) {
  return {
    flow_url: api.flow_url,
    user_phone: toStringValue(body.phone),
    user_name: toStringValue(body.name),
    other: toStringValue(body.other),
    ip: getClientIp(req, body),
    ua: getUserAgent(req, body),
    api_key: api.key,
    sub1: toStringValue(body.sub1),
    sub2: toStringValue(body.sub2),
    sub3: toStringValue(body.sub3),
    sub4: toStringValue(body.sub4),
    sub5: toStringValue(body.sub5),
    ajax: '1',
  };
}

function buildQueryString(params) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.append(key, toStringValue(value));
  }

  return searchParams.toString();
}

async function getTrackId(params, userAgent) {
  const trackQuery = buildQueryString(params);
  const separator = params.flow_url.includes('?') ? '&' : '?';
  const trackUrl = `${params.flow_url}${separator}${trackQuery}`;

  const response = await fetch(trackUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: userAgent ? { 'user-agent': userAgent } : {},
  });

  const trackId = await response.text();
  return trackId.trim();
}

async function sendLead(params, userAgent) {
  const url = 'https://leadrock.com/api/v2/lead/save';
  const body = buildQueryString(params);

  const headers = {
    'content-type': 'application/x-www-form-urlencoded',
  };

  if (userAgent) {
    headers['user-agent'] = userAgent;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    redirect: 'follow',
  });

  const rawText = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }

  return {
    status: response.status,
    ok: response.ok,
    data: parsed,
    raw: rawText,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method Not Allowed',
    });
  }

  try {
    const body = getRequestBody(req);

    const name = toStringValue(body.name).trim();
    const phone = toStringValue(body.phone).trim();

    if (!phone) {
      return res.status(400).json({
        ok: false,
        error: 'Phone is required',
      });
    }

    const params = buildParams(body, req);

    const trackId = await getTrackId(params, params.ua);
    params.track_id = trackId;

    const signBase = buildQueryString(params) + api.secret;
    params.sign = sha1(signBase);

    const partnerResponse = await sendLead(params, params.ua);

    return res.status(200).json({
      ok: true,
      sent: {
        name,
        phone,
        other: params.other,
        sub1: params.sub1,
        sub2: params.sub2,
        sub3: params.sub3,
        sub4: params.sub4,
        sub5: params.sub5,
        ip: params.ip,
        ua: params.ua,
      },
      track_id: trackId,
      partner_response: partnerResponse.data,
      partner_status: partnerResponse.status,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
