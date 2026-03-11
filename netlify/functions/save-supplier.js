// ═══════════════════════════════════════════════════════
//  I WORK · BPOS LATAM — Guardar proveedor en Notion
//  Netlify Function: /.netlify/functions/save-supplier
//
//  Variables de entorno requeridas en Netlify:
//    NOTION_TOKEN       → tu Integration Token de Notion
//    NOTION_DATABASE_ID → 2c1129fd0316406cad3edf22ac56b1e4
//    ADMIN_EMAIL        → admin@iworkcenter.work
// ═══════════════════════════════════════════════════════

exports.handler = async (event) => {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const NOTION_TOKEN  = process.env.NOTION_TOKEN;
  const DATABASE_ID   = process.env.NOTION_DATABASE_ID || '2c1129fd0316406cad3edf22ac56b1e4';
  const ADMIN_EMAIL   = process.env.ADMIN_EMAIL || 'admin@iworkcenter.work';

  if (!NOTION_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'NOTION_TOKEN no configurado en Netlify' }) };
  }

  let d;
  try { d = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) }; }

  const s = v => v && v !== '—' ? v : null;
  const today = new Date().toISOString().slice(0, 10);
  const docId = d.id || ('FORM-SUP-' + Date.now());

  // ─── Construir propiedades para Notion ───────────────
  const properties = {
    'Razón Social': { title: [{ text: { content: d.razon || 'Sin nombre' } }] },
  };

  if (s(d.nit))       properties['NIT']            = { rich_text: [{ text: { content: d.nit } }] };
  if (s(d.tipo))      properties['Tipo de Empresa'] = { select: { name: d.tipo.split(' — ')[0] } };
  if (s(d.pais))      properties['País']            = { rich_text: [{ text: { content: d.pais } }] };
  if (s(d.ciudad))    properties['Ciudad']          = { rich_text: [{ text: { content: d.ciudad } }] };
  if (s(d.regimen))   properties['Régimen Tributario'] = { select: { name: d.regimen } };
  if (s(d.cat))       properties['Categoría']       = { select: { name: d.cat } };
  if (s(d.cob))       properties['Cobertura']       = { select: { name: d.cob } };
  if (s(d.contacto))  properties['Contacto']        = { rich_text: [{ text: { content: d.contacto } }] };
  if (s(d.cargo))     properties['Cargo']           = { rich_text: [{ text: { content: d.cargo } }] };
  if (s(d.email))     properties['Email']           = { email: d.email };
  if (s(d.emailfact)) properties['Email Facturación'] = { email: d.emailfact };
  if (s(d.telrep))    properties['Teléfono']        = { phone_number: d.telrep };
  if (s(d.wa))        properties['WhatsApp']        = { phone_number: d.wa };
  if (s(d.banco))     properties['Banco']           = { rich_text: [{ text: { content: d.banco } }] };
  if (s(d.tipocta))   properties['Tipo Cuenta']     = { select: { name: d.tipocta } };
  if (s(d.numcta))    properties['Número Cuenta']   = { rich_text: [{ text: { content: d.numcta } }] };
  if (s(d.titular))   properties['Titular Cuenta']  = { rich_text: [{ text: { content: d.titular } }] };
  if (s(d.titularid)) properties['NIT Titular']     = { rich_text: [{ text: { content: d.titularid } }] };
  if (s(d.moneda))    properties['Moneda']          = { select: { name: d.moneda.split(' — ')[0] } };
  if (s(d.plazo))     properties['Plazo de Pago']   = { select: { name: d.plazo } };
  if (s(d.factura))   properties['Tipo Facturación']= { select: { name: d.factura } };
  if (s(d.obs))       properties['Observaciones']   = { rich_text: [{ text: { content: d.obs } }] };
  if (s(d.web))       properties['Sitio Web']       = { url: d.web };
                      properties['Estado']          = { select: { name: 'Pendiente revisión' } };
                      properties['Fecha Registro']  = { date: { start: today } };
                      properties['ID Registro']     = { rich_text: [{ text: { content: docId } }] };

  // ─── 1. Guardar en Notion ────────────────────────────
  try {
    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties
      })
    });

    const notionData = await notionRes.json();

    if (!notionRes.ok) {
      console.error('Notion error:', notionData);
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ ok: false, error: 'Error Notion: ' + (notionData.message || 'Revisa el token y database ID') })
      };
    }

    // ─── 2. Enviar correo de notificación ────────────
    const emailBody = `NUEVO PROVEEDOR REGISTRADO
ID: ${docId} · ${d.fecha || today}

EMPRESA: ${d.razon} · NIT: ${d.nit}
CONTACTO: ${d.contacto} (${d.cargo})
EMAIL: ${d.email} · WhatsApp: ${d.wa || '—'}
BANCO: ${d.banco} · ${d.tipocta} · ${d.numcta}
CATEGORÍA: ${d.cat} · COBERTURA: ${d.cob}

Ver en Notion: ${notionData.url || 'https://notion.so/'}`;

    const fd = new FormData();
    fd.append('name',     d.razon || 'Proveedor');
    fd.append('email',    ADMIN_EMAIL);
    fd.append('message',  emailBody);
    fd.append('_subject', `📋 Nuevo Proveedor: ${d.razon} · NIT ${d.nit}`);
    fd.append('_captcha', 'false');
    fd.append('_template','table');
    if (s(d.email)) fd.append('_replyto', d.email);

    fetch('https://formsubmit.co/ajax/' + ADMIN_EMAIL, {
      method: 'POST', body: fd, headers: { Accept: 'application/json' }
    }).catch(() => {});

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        msg: '✅ Proveedor registrado en Notion exitosamente',
        notion_url: notionData.url
      })
    };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Error: ' + e.message }) };
  }
};
