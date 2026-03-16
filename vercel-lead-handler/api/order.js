export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { name, phone, other, sub1, sub2, sub3, sub4, sub5 } = req.body || {};

  console.log("Lead:", name, phone);

  return res.status(200).json({
    ok: true,
    name,
    phone
  });
}