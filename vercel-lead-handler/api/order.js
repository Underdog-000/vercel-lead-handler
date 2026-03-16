export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, phone } = req.body || {};

  return res.status(200).json({
    ok: true,
    name,
    phone
  });
}
