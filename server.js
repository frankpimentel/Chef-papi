// ============================================================
// CHEF PAPI — WhatsApp Ordering Backend v6
// Stack: Node.js + Express | Supabase | Meta WhatsApp Cloud API
// Features: AI FAQ, Dominican slang, NCF, human handoff,
//           session timeout, delivery zone check
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());
app.use(express.static(__dirname + "/public"));

const {
  WHATSAPP_TOKEN,
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_PHONE_ID,
  SUPABASE_URL,
  SUPABASE_KEY,
  ANTHROPIC_API_KEY,
  PORT = 3000,
} = process.env;

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── FLAVORS ──────────────────────────────────────────────────
const FLAVORS = {
  natural:  { title: "Salt & Pepper",       emoji: "🧂", short: "Salt & Pepper" },
  pomodoro: { title: "Marinara",             emoji: "🍅", short: "Marinara" },
  pesto:    { title: "Pesto de Albahaca",    emoji: "🌿", short: "Pesto" },
  bbq:      { title: "BBQ Glaze",            emoji: "🔥", short: "BBQ" },
};

// ── NUTRITION ─────────────────────────────────────────────────
const NUTRITION = {
  natural: {
    name: "Salt & Pepper",
    weight: "200g",
    cals: "~310 kcal",
    protein: "~63g",
    fat: "~7g",
    carbs: "~0g",
    sugar: "~0g",
    allergens: null,
  },
  pomodoro: {
    name: "Marinara",
    weight: "280g",
    cals: "~368 kcal",
    protein: "~61g",
    fat: "~8.5g",
    carbs: "~6.9g",
    sugar: "~4.6g",
    allergens: null,
  },
  pesto: {
    name: "Pesto de Albahaca",
    weight: "280g",
    cals: "~592 kcal",
    protein: "~65g",
    fat: "~38g",
    carbs: "~2.5g",
    sugar: "~0.4g",
    allergens: "Lácteos (Queso Parmesano)",
  },
  bbq: {
    name: "BBQ Glaze",
    weight: "280g",
    cals: "~439 kcal",
    protein: "~61g",
    fat: "~9.2g",
    carbs: "~25.3g",
    sugar: "~22.5g",
    allergens: "Mostaza",
  },
};

// ── PRICES ───────────────────────────────────────────────────
const PRICES = { 3: 870, 5: 1450, 8: 2320 };
const UNIT_PRICE = 290;

// ── CATALOG ──────────────────────────────────────────────────
const CATALOG_ID = "956996010479028";
const CATALOG_PRODUCT_MAP = {
  "1p7bh0r1kc": "natural",
  "xnf2veolk3": "pomodoro",
  "4ihnitfbi4": "pesto",
  "ujflq59q37": "bbq",
};

// ── ERROR MESSAGES ───────────────────────────────────────────
const ERROR_MESSAGES = [
  `¡Coño! Se me cayó algo de mi lado 😅\n\nDame un momento que lo resuelvo. Si sigue el problema escríbenos:\nwa.me/18098831687`,
  `¡Qué vaina más grande! Algo se rompió por acá 🤦‍♂️\n\nEscríbenos y te ayudamos enseguida:\nwa.me/18098831687`,
  `¡Diablo! Algo salió mal de mi lado 😤\n\nDame 2 minutos. Si no respondo escríbenos:\nwa.me/18098831687`,
];

function randomError() {
  return ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)];
}

// ── DELIVERY ZONES ───────────────────────────────────────────
const DISTRITO_SECTORS = [
  // Core sectors
  "piantini", "naco", "evaristo morales", "bella vista", "gazcue",
  "zona colonial", "ciudad colonial", "la esperilla", "serralles",
  "arroyo hondo", "los prados", "mirador norte", "mirador sur",
  "fernandez", "paraiso", "los cacicazgos", "urbanizacion real",
  "ciudad nueva", "renacimiento", "los restauradores", "miraflores",
  "el millon", "cristo rey", "gualey", "villa juana", "villa consuelo",
  "mejoramiento social", "27 de febrero", "los jardines",
  "jardines del norte", "jardines del sur", "los peralejos",
  "ensanche la fe", "ensanche ozama", "ensanche luperon",
  "ensanche naco", "ensanche quisqueya", "ensanche julieta",
  "ensanche espaillat", "ensanche capotillo", "ensanche isabelita",
  "villa agricola", "villa francisca", "villa maria",
  "los guandules", "simon bolivar", "la julia", "la zurza",
  "la agustina", "la castellana", "los rios", "los cacicazgos",
  "el vergel", "el pedregal", "los altos de arroyo hondo",
  "cerros de arroyo hondo", "vistamar", "tropical del sur",
  "tropical", "alma rosa", "nuestra señora de la paz",
  "reparto mendoza", "reparto universitario", "los trinitarios",
  "palma real", "covadonga", "luperón", "san carlos",
  "san miguel", "san geronimo", "honduras", "herrera",
  "mao", "villas del mar", "cacicazgos", "mata hambre",
  "buenos aires", "km 9", "km 11", "autopista duarte",
  "autopista 30 de mayo", "av independencia", "av maximo gomez",
  "av john f kennedy", "av winston churchill", "av bolivar",
  "av 27 de febrero", "av sarasota", "av ortega y gasset"
];

const OUTSIDE_SECTORS = [
  "santo domingo este", "sd este", "los minas", "sabana perdida",
  "san luis", "guerra", "hato nuevo", "boca chica",
  "santo domingo norte", "sd norte", "villa mella", "licey",
  "los alcarrizos", "pedro brand", "san cristobal",
  "santiago", "la romana", "san pedro de macoris",
  "puerto plata", "la vega", "moca", "bonao", "azua",
  "barahona", "higuey", "punta cana", "bavaro",
  "santo domingo oeste", "sd oeste", "manoguayabo"
];

const CUTOFF_HOUR = 15; // 3PM
const CUTOFF_MINUTE = 30; // :30

function extractSector(address) {
  const lower = address.toLowerCase();
  for (const sector of DISTRITO_SECTORS) {
    if (lower.includes(sector)) {
      return sector.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  for (const sector of OUTSIDE_SECTORS) {
    if (lower.includes(sector)) {
      return sector.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  const parts = address.split(",").map(p => p.trim());
  if (parts.length >= 2) return parts[parts.length - 2];
  return "Por confirmar";
}

function checkDeliveryZone(address) {
  const lower = address.toLowerCase();
  for (const sector of OUTSIDE_SECTORS) {
    if (lower.includes(sector)) return "outside";
  }
  for (const sector of DISTRITO_SECTORS) {
    if (lower.includes(sector)) return "distrito";
  }
  return "unknown";
}

function getSDTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santo_Domingo" }));
}

function isBeforeCutoff() {
  const now = getSDTime();
  const cutoff = new Date(now);
  cutoff.setHours(CUTOFF_HOUR, CUTOFF_MINUTE, 0, 0);
  return now < cutoff;
}

function getDeliveryMessage(zone) {
  if (zone === "outside") {
    return {
      message: "Tu sector está fuera del Distrito Nacional. Tu entrega llegará en las próximas 24 horas. Estamos trabajando para llevar entregas más rápidas a tu zona pronto.",
      estimated: "24 horas",
      confirmation: "Tu orden llegará en las próximas 24 horas.",
      zone: "outside"
    };
  }
  if (zone === "distrito") {
    if (isBeforeCutoff()) {
      return {
        message: "Estás en el Distrito Nacional. Tu orden llegará hoy entre 45 minutos y 3 horas.",
        estimated: "Hoy 45min - 3 horas",
        confirmation: "Tu orden llegará hoy entre 45 minutos y 3 horas.",
        zone: "distrito"
      };
    } else {
      return {
        message: "Como es después de las 3:30PM, tu entrega llegará mañana por la mañana.",
        estimated: "Mañana por la mañana",
        confirmation: "Tu orden llegará mañana por la mañana.",
        zone: "distrito"
      };
    }
  }
  return null;
}

// ── SESSION TIMEOUT (minutes) ────────────────────────────────
// 10 min — resets cleanly if user goes idle mid-flow
const SESSION_TIMEOUT_MINUTES = 10;
// States where timeout resets silently (no disconnect message)
const SILENT_RESET_STATES = ["AWAITING_ZONE", "AWAITING_PACK", "DONE", "AWAITING_PAYMENT"];

// ── CHEF PAPI KNOWLEDGE BASE ─────────────────────────────────
const CHEF_PAPI_KNOWLEDGE = `
Eres el asistente virtual de Chef Papi, una marca de pollo cocinado al grill,
listo para comer, que se entrega frío en Santo Domingo, República Dominicana.

Tu personalidad: Eres el asistente de Chef Papi. Tu tono es amigable, directo y con un toque de humor ligero — como un buen amigo que sabe de comida y te ayuda sin rodeos. No eres corporativo ni frío, pero tampoco usas slang de calle. Eres simplemente cool, útil y agradable.

REGLAS ABSOLUTAS DE FORMATO:
- NUNCA uses asteriscos (*) para negritas ni ningún markdown
- NUNCA uses slang callejero ni expresiones como "brutal", "qué lo qué", "mano", "brother", "wepa"
- NUNCA empieces respuestas con "Hola" si ya estás en medio de una conversación
- Responde en texto plano siempre, sin formato especial
- Máximo 3 líneas por respuesta
- Un solo emoji al final si aplica, nunca en medio del texto

INFORMACIÓN DEL PRODUCTO:
- Pollo cocinado al grill para darle ese delicioso sabor que usted merece
- Pollo importado de alta calidad, el mismo tipo que usan los mejores restaurantes en RD
- Cocinado al grill aquí mismo en Santo Domingo
- Sabores disponibles: Salt & Pepper, Marinara, Pesto de Albahaca, BBQ Glaze
- NO calentar en el envase plástico. Pasar el pollo a un plato antes de calentar.
- Dura 6 días en la nevera después de descongelado. Nunca romper la cadena de frío.
- Se puede congelar. Para descongelar, poner en la nevera un día antes de comer.

INFORMACIÓN NUTRICIONAL (por unidad):
Salt & Pepper — ~310 kcal | Proteína: ~63g | Grasas: ~7g | Carbs: ~0g | Sin alérgenos
Marinara — 280g — ~368 kcal | Proteína: ~61g | Grasas: ~8.5g | Carbs: ~6.9g | Sin alérgenos
Pesto de Albahaca — 280g — ~592 kcal | Proteína: ~65g | Grasas: ~38g | Carbs: ~2.5g | ⚠️ Contiene: Lácteos (Queso Parmesano)
BBQ Glaze — 280g — ~439 kcal | Proteína: ~61g | Grasas: ~9.2g | Carbs: ~25.3g | ⚠️ Contiene: Mostaza

PRECIOS:
- RD$290 por unidad, mínimo 3 unidades
- Delivery: RD$120

ENTREGAS:
- Solo en Santo Domingo por el momento
- Pedidos antes de las 3:30pm se entregan hoy en 45 minutos a 3 horas
- Pedidos después de las 3:30pm se entregan mañana por la mañana
- Solo tarjeta por el momento

CANCELACIONES:
- Una vez la orden está creada y facturada no se puede cancelar ni cambiar

ALÉRGENOS:
- Pesto de Albahaca contiene lácteos (queso parmesano)
- BBQ Glaze contiene mostaza
- Ningún producto contiene nuez

INSTRUCCIONES:
- Si te preguntan cómo ordenar, diles que elijan un pack de la lista
- Responde SIEMPRE en español, de forma clara y amigable
- Sé breve. Máximo 3-4 líneas por respuesta
- Puedes usar un emoji ocasional pero no exageres
- NUNCA inventes información sobre el producto
- NUNCA uses asteriscos, markdown, ni negritas
- NUNCA uses slang de calle
`;

// ============================================================
// WEBHOOK VERIFICATION
// ============================================================
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
// PRODUCT PAGES
// ============================================================
const PRODUCT_PAGES = {
  natural: {
    name: "Salt & Pepper",
    emoji: "🧂",
    description: "Pechuga de pollo al grill con sal y pimienta. Sabor limpio, proteína pura. Perfecta para tus meals de la semana.",
    price: "RD$290 por unidad",
    color: "#f97316",
    nutri: NUTRITION.natural,
  },
  pomodoro: {
    name: "Marinara",
    emoji: "🍅",
    description: "Pechuga al grill con salsa marinara italiana. Un toque diferente que nunca falla.",
    price: "RD$290 por unidad",
    color: "#ef4444",
    nutri: NUTRITION.pomodoro,
  },
  pesto: {
    name: "Pesto de Albahaca",
    emoji: "🌿",
    description: "Pechuga al grill con pesto de albahaca fresca y queso parmesano. Fresco, aromático y lleno de sabor.",
    price: "RD$290 por unidad",
    color: "#22c55e",
    nutri: NUTRITION.pesto,
  },
  bbq: {
    name: "BBQ Glaze",
    emoji: "🔥",
    description: "Pechuga al grill con salsa BBQ glaze. Ahumada, dulce y adictiva. La favorita de muchos.",
    price: "RD$290 por unidad",
    color: "#f59e0b",
    nutri: NUTRITION.bbq,
  },
};

app.get("/product/:flavor", (req, res) => {
  const p = PRODUCT_PAGES[req.params.flavor];
  if (!p) return res.status(404).send("Producto no encontrado");
  const waLink = `https://wa.me/18098831687?text=${encodeURIComponent(`Hola! Quiero ordenar ${p.emoji} ${p.name}`)}`;
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${p.name} — Chef Papi</title>
  <meta property="og:title" content="${p.name} — Chef Papi"/>
  <meta property="og:description" content="${p.description}"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #111; color: #eee; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #1a1a1a; border-radius: 20px; max-width: 400px; width: 100%; overflow: hidden; }
    .hero { background: ${p.color}22; border-bottom: 1px solid #333; padding: 48px 24px; text-align: center; font-size: 80px; }
    .body { padding: 28px 24px; }
    .brand { color: ${p.color}; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    h1 { font-size: 26px; font-weight: bold; margin-bottom: 12px; }
    .desc { color: #aaa; line-height: 1.6; margin-bottom: 20px; }
    .price { font-size: 22px; font-weight: bold; color: ${p.color}; margin-bottom: 20px; }
    .nutri { background: #222; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
    .nutri-title { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .nutri-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .nutri-item { text-align: center; }
    .nutri-val { font-size: 18px; font-weight: bold; color: ${p.color}; }
    .nutri-label { font-size: 11px; color: #666; margin-top: 2px; }
    .allergen { color: #f59e0b; font-size: 12px; margin-top: 10px; }
    .detail { color: #555; font-size: 12px; margin-bottom: 20px; }
    .btn { display: block; background: #25d366; color: white; text-decoration: none; text-align: center; padding: 16px; border-radius: 12px; font-size: 16px; font-weight: bold; }
    .btn:hover { background: #20b858; }
    .footer { margin-top: 24px; color: #555; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="hero">${p.emoji}</div>
    <div class="body">
      <div class="brand">Chef Papi 🍗</div>
      <h1>${p.name}</h1>
      <div class="desc">${p.description}</div>
      <div class="price">${p.price}</div>
      <div class="nutri">
        <div class="nutri-title">Información Nutricional · ${p.nutri.weight}</div>
        <div class="nutri-grid">
          <div class="nutri-item"><div class="nutri-val">${p.nutri.cals}</div><div class="nutri-label">Calorías</div></div>
          <div class="nutri-item"><div class="nutri-val">${p.nutri.protein}</div><div class="nutri-label">Proteína</div></div>
          <div class="nutri-item"><div class="nutri-val">${p.nutri.fat}</div><div class="nutri-label">Grasas</div></div>
          <div class="nutri-item"><div class="nutri-val">${p.nutri.carbs}</div><div class="nutri-label">Carbohidratos</div></div>
        </div>
        ${p.nutri.allergens ? `<div class="allergen">⚠️ Contiene: ${p.nutri.allergens}</div>` : ""}
      </div>
      <div class="detail">Mínimo 3 unidades · Delivery RD$120</div>
      <a href="${waLink}" class="btn">💬 Ordenar por WhatsApp</a>
    </div>
  </div>
  <div class="footer">Solo entregamos en Santo Domingo · Pedidos antes 3:30PM llegan hoy</div>
</body>
</html>`);
});

// ============================================================
// PRIVACY PAGE
// ============================================================
app.get("/privacy", (req, res) => {
  res.send("<h1>Chef Papi Privacy Policy</h1><p>We collect your name, phone number, and delivery address solely to process your food orders. We do not share your information with third parties except for delivery purposes. Contact: frank@integra-foods.com</p>");
});

// ============================================================
// MAIN WEBHOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    // Deduplicate using Supabase — survives Railway restarts
    const msgId = message.id;
    if (msgId) {
      const { data: existing } = await supabase
        .from("processed_messages")
        .select("id")
        .eq("message_id", msgId)
        .maybeSingle();
      if (existing) {
        console.log("Duplicate message ignored:", msgId);
        return;
      }
      await supabase.from("processed_messages").insert({ message_id: msgId });
      // Clean up messages older than 24 hours to prevent WhatsApp re-delivery duplicates
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("processed_messages").delete().lt("created_at", oneDayAgo);
    }

    // Ignore messages older than 5 minutes — blocks WhatsApp stale re-deliveries
    const msgTimestamp = parseInt(message.timestamp || "0", 10);
    if (msgTimestamp && (Date.now() / 1000) - msgTimestamp > 300) {
      console.log(`Stale message skipped (${Math.round((Date.now() / 1000) - msgTimestamp)}s old):`, msgId);
      return;
    }

    const phone = message.from;
    const type  = message.type;

    // Catalog orders handled separately
    if (type === "order") {
      console.log(`📦 catalog order from ${phone}`);
      await handleCatalogOrder(phone, message.order);
      return;
    }

    let input = "";
    if (type === "text") {
      input = message.text.body.trim();
    } else if (type === "interactive") {
      if (message.interactive.type === "list_reply") {
        input = message.interactive.list_reply.id;
      }
      if (message.interactive.type === "button_reply") {
        input = message.interactive.button_reply.id;
      }
    }

    await handleMessage(phone, input);
    console.log(`📨 phone=${phone} type=${type} input="${input}"`);
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// ============================================================
// CORE MESSAGE HANDLER
// ============================================================
async function handleMessage(phone, input) {
  try {
  let session = await getSession(phone);

  // ── SESSION TIMEOUT CHECK ─────────────────────────────────
  if (session && session.state !== "AWAITING_ZONE") {
    const expired = await isSessionExpired(session);
    if (expired) {
      const silentReset = SILENT_RESET_STATES.includes(session.state);
      await createSession(phone);
      session = await getSession(phone);
      if (!silentReset) {
        await sendMessage(phone, "Ay, se fue la conexión 😅 ¡Empecemos de nuevo!");
      }
      await sendZoneCheck(phone);
      return;
    }
  }

  // ── NEW CUSTOMER — ask zone first ─────────────────────────
  if (!session) {
    await createSession(phone);
    await sendZoneCheck(phone);
    return;
  }

  // ── HUMAN HANDOFF ─────────────────────────────────────────
  if (
    input.toLowerCase().includes("humano") ||
    input.toLowerCase().includes("hablar con") ||
    input === "human"
  ) {
    await sendHumanHandoff(phone);
    return;
  }

  // ── ROUTE BY STATE ────────────────────────────────────────
  switch (session.state) {

    case "AWAITING_ZONE": {
      const normalized = input.toLowerCase().trim();
      const isYes = input === "zone_yes" || ["si","sí","yes","sd","sto domingo","santo domingo","sí estoy","si estoy"].includes(normalized);
      const isNo  = input === "zone_no"  || ["no","nope","fuera","no estoy","nel"].includes(normalized);
      if (isYes) {
        // Ask if they're in Distrito Nacional
        await updateSession(phone, { state: "AWAITING_ZONE" });
        await sendDistrictButtons(phone);
      } else if (isNo) {
        await sendMessage(phone,
          `Lo sentimos 😔 Por el momento solo entregamos en Santo Domingo.\n\n` +
          `Estamos trabajando para llegar a más ciudades muy pronto. ¡Mantente pendiente! 🍗`
        );
        await createSession(phone);
      } else if (input === "district_yes" || input === "district_no" || input === "district_unsure") {
        const zoneHint = input === "district_yes" ? "distrito" : input === "district_no" ? "outside" : "unknown";
        await updateSession(phone, { state: "AWAITING_PACK", pending_order: { zone_hint: zoneHint } });

        if (input === "district_yes") {
          // Show delivery time upfront based on current time
          if (isBeforeCutoff()) {
            await sendMessage(phone, "✅ Perfecto. Como estás en el Distrito Nacional y es antes de las 3:30PM, tu orden llegará hoy entre 45 minutos y 3 horas. 🛵");
          } else {
            await sendMessage(phone, "✅ Perfecto. Como es después de las 3:30PM, tu orden llegará mañana por la mañana. 🛵");
          }
        } else if (input === "district_no") {
          await sendMessage(phone, "📦 Tu entrega llegará en las próximas 24 horas desde que confirmes tu pago.");
        } else if (input === "district_unsure") {
          if (isBeforeCutoff()) {
            await sendMessage(phone, "No hay problema. Si estás en el Distrito Nacional tu orden llega hoy entre 45min y 3 horas. Si estás fuera, en las próximas 24 horas. Confirmamos con tu dirección al final.");
          } else {
            await sendMessage(phone, "No hay problema. Si estás en el Distrito Nacional tu orden llega mañana por la mañana. Si estás fuera, en las próximas 24 horas. Confirmamos con tu dirección al final.");
          }
        }
        await sendWelcome(phone);
      } else {
        await sendZoneCheck(phone);
      }
      break;
    }

    case "AWAITING_PACK":
      if (["3","5","8"].includes(input)) {
        await handlePackSelection(phone, session, input);
      } else if (isQuestion(input)) {
        const answer = await askAI(input);
        await sendMessage(phone, answer);
        await sendWelcome(phone);
      } else {
        await sendWelcome(phone);
      }
      break;

    case "AWAITING_FLAVOR":
      if (isQuestion(input) && !Object.keys(FLAVORS).includes(input)) {
        const answer = await askAI(input);
        await sendMessage(phone, answer);
        await sendMessage(phone, "Listo, sigamos con tu orden 👆");
      } else {
        await handleFlavorSelection(phone, session, input);
      }
      break;

    case "AWAITING_QTY":
      if (isQuestion(input) && isNaN(parseInt(input))) {
        const answer = await askAI(input);
        await sendMessage(phone, answer);
        await sendMessage(phone, "Listo, ¿cuántas unidades quieres? Escribe el número:");
      } else {
        await handleQtyInput(phone, session, input);
      }
      break;

    case "AWAITING_CONFIRM":
      if (isQuestion(input)) {
        const answer = await askAI(input);
        await sendMessage(phone, answer);
        await sendConfirmButtons(phone);
      } else {
        await handleConfirmation(phone, session, input);
      }
      break;

    case "AWAITING_NCF":
      if (isQuestion(input)) {
        const answer = await askAI(input);
        await sendMessage(phone, answer);
        await sendNCFButtons(phone);
      } else {
        await handleNCFSelection(phone, session, input);
      }
      break;

    case "AWAITING_RNC":
      await handleRNCInput(phone, session, input);
      break;

    case "AWAITING_COMPANY_NAME":
      await handleCompanyNameInput(phone, session, input);
      break;

    case "AWAITING_DELIVERY_CONFIRM":
      await handleDeliveryConfirm(phone, session, input);
      break;

    case "AWAITING_COMPANY_CONFIRM":
      await handleCompanyConfirm(phone, session, input);
      break;

    case "AWAITING_NAME":
      await handleNameInput(phone, session, input);
      break;

    case "AWAITING_ADDRESS":
      await handleAddressInput(phone, session, input);
      break;

    case "AWAITING_ADDRESS_TYPE":
      await handleAddressType(phone, session, input);
      break;

    case "AWAITING_TOWER":
      await handleTowerInput(phone, session, input);
      break;

    case "AWAITING_REFERENCE":
      await handleReferenceInput(phone, session, input);
      break;

    case "AWAITING_PAYMENT":
      if (input === "cancel_order") {
        // Cancel the pending order in DB
        if (session.pending_order?.order_id) {
          await supabase.from("orders").update({ status: "cancelled" }).eq("id", session.pending_order.order_id);
        }
        // Reset to pack selection keeping address/name
        await updateSession(phone, {
          state: "AWAITING_PACK",
          pending_order: {
            delivery_address: session.pending_order?.delivery_address,
            customer_name: session.pending_order?.customer_name,
          },
        });
        await sendMessage(phone, `Ta bien, cancelamos esa orden 🔄\n\n¿Qué pack quieres esta vez?`);
        await sendWelcome(phone);
      } else {
        await sendMessage(phone,
          `⏳ Esperando tu pago. Usa este link:\n\n${session.pending_order?.payment_link}\n\n` +
          `Si tuviste algún problema escríbenos y te ayudamos 👨‍🍳`
        );
        await sendCancelOrderButton(phone);
      }
      break;

    case "DONE": {
      const greetings = ["hola","hello","hi","buenas","buen dia","buen día","buenos dias","buenos días","ey","hey","buenas tardes","buenas noches"];
      const isGreeting = greetings.includes(input.toLowerCase().trim());
      if (isGreeting) {
        await sendDoneButtons(phone);
      } else if (isQuestion(input)) {
        const answer = await askAI(input);
        await sendMessage(phone, answer);
      } else {
        await sendDoneButtons(phone);
      }
      break;
    }

    default:
      await createSession(phone);
      await sendZoneCheck(phone);
  }
  } catch (err) {
    console.error("handleMessage error:", err);
    try {
      // Detect if it's a database/infrastructure error vs a normal bug
      const isInfraError = err.message && (
        err.message.includes("fetch failed") ||
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("network") ||
        err.message.includes("timeout") ||
        err.message.includes("503") ||
        err.message.includes("502") ||
        err.message.includes("connect")
      );
      if (isInfraError) {
        await sendMessage(phone,
          `Estamos experimentando problemas técnicos en este momento 🙏\n\n` +
          `Por favor escríbenos directamente y te atendemos enseguida:\n` +
          `wa.me/18098831687\n\n` +
          `Disculpa las molestias. ¡Volvemos pronto! 🍗`
        );
      } else {
        await sendMessage(phone, randomError());
      }
    } catch (e) {
      console.error("Failed to send error message:", e);
    }
  }
}

// ============================================================
// STATE HANDLERS
// ============================================================

async function handlePackSelection(phone, session, input) {
  const size = parseInt(input);
  if (![3, 5, 8].includes(size)) {
    await sendWelcome(phone);
    return;
  }
  await updateSession(phone, {
    state: "AWAITING_FLAVOR",
    pending_order: { pack_size: size, selections: [], price: PRICES[size] },
  });
  await sendMessage(phone,
    `Pack de ${size} unidades seleccionado.\n` +
    `RD$290 x ${size} = RD$${PRICES[size].toLocaleString()} + RD$120 delivery\n\n` +
    `¿Qué sabor quieres agregar? Te quedan ${size} unidades.`
  );
  await sendFlavorList(phone, size);
}

async function handleFlavorSelection(phone, session, input) {
  if (!FLAVORS[input]) {
    const unidadesLeft = session.pending_order.pack_size - session.pending_order.selections.length;
    await sendMessage(phone, "Selecciona un sabor de la lista 👇");
    await sendFlavorList(phone, unidadesLeft);
    return;
  }
  const flavor       = FLAVORS[input];
  const unidadesLeft = session.pending_order.pack_size - session.pending_order.selections.length;

  // If only 1 slot left, skip quantity question and auto-add it
  if (unidadesLeft === 1) {
    const newSelections = [...session.pending_order.selections, input];
    const updatedOrder  = { ...session.pending_order, selections: newSelections, current_flavor: null };
    await updateSession(phone, { state: "AWAITING_CONFIRM", pending_order: updatedOrder });
    const summary = buildSummary(newSelections);
    await sendMessage(phone,
      `${flavor.emoji} *${flavor.title}* agregado.\n\n✅ ¡Tu pack está listo!\n\n${summary}\n\n` +
      `Subtotal: RD$${PRICES[session.pending_order.pack_size].toLocaleString()}\n` +
      `Delivery: RD$120\n` +
      `*TOTAL: RD$${(PRICES[session.pending_order.pack_size] + 120).toLocaleString()}*`
    );
    await sendConfirmButtons(phone);
    return;
  }

  await updateSession(phone, {
    state: "AWAITING_QTY",
    pending_order: { ...session.pending_order, current_flavor: input },
  });
  await sendMessage(phone,
    `${flavor.emoji} *${flavor.title}* — ¿cuántas unidades quieres? (te quedan *${unidadesLeft} unidades*)\n\nEscribe el número:`
  );
}

async function handleQtyInput(phone, session, input) {
  const qty          = parseInt(input);
  const order        = session.pending_order;
  const unidadesLeft = order.pack_size - order.selections.length;
  const flavor       = FLAVORS[order.current_flavor];

  if (!qty || qty < 1 || isNaN(qty)) {
    await sendMessage(phone, `Escribe un número entre 1 y ${unidadesLeft} 👇`);
    return;
  }
  if (qty > unidadesLeft) {
    await sendMessage(phone,
      `Solo te quedan *${unidadesLeft} unidades*. ¿Cuántas ${flavor.emoji} ${flavor.title} quieres? (máximo ${unidadesLeft})`
    );
    return;
  }

  const newSelections = [...order.selections, ...Array(qty).fill(order.current_flavor)];
  const remaining     = order.pack_size - newSelections.length;

  if (remaining === 0) {
    const updatedOrder = { ...order, selections: newSelections, current_flavor: null };
    await updateSession(phone, { state: "AWAITING_CONFIRM", pending_order: updatedOrder });
    const summary = buildSummary(newSelections);
    await sendMessage(phone,
      `✅ ¡Tu pack está listo!\n\n${summary}\n\n` +
      `Subtotal: RD$${PRICES[order.pack_size].toLocaleString()}\n` +
      `Delivery: RD$120\n` +
      `*TOTAL: RD$${(PRICES[order.pack_size] + 120).toLocaleString()}*`
    );
    await sendConfirmButtons(phone);
  } else {
    const updatedOrder = { ...order, selections: newSelections, current_flavor: null };
    await updateSession(phone, { state: "AWAITING_FLAVOR", pending_order: updatedOrder });
    await sendMessage(phone, `✅ Agregado. Te quedan *${remaining} unidades*.\n¿Qué otro sabor quieres?`);
    await sendFlavorList(phone, remaining);
  }
}

async function handleConfirmation(phone, session, input) {
  if (input === "confirm") {
    await continueToCustomerInfo(phone, session);
  } else if (input === "change") {
    const size = session.pending_order.pack_size;
    await updateSession(phone, {
      state: "AWAITING_FLAVOR",
      pending_order: { pack_size: size, selections: [], price: PRICES[size] },
    });
    await sendMessage(phone, `Ta bien! Empecemos de nuevo 🔄\nTe quedan *${size} unidades*.`);
    await sendFlavorList(phone, size);
  }
}

async function handleNCFSelection(phone, session, input) {
  if (input === "ncf_b02") {
    const updatedOrder = { ...session.pending_order, ncf_type: "B02" };
    await updateSession(phone, { pending_order: updatedOrder });
    await createOrderAndCharge(phone, { ...session, pending_order: updatedOrder });
  } else if (input === "ncf_b01") {
    // Check if returning customer has saved company
    const customer = await getCustomer(phone);
    if (customer?.rnc && customer?.company_name) {
      await updateSession(phone, {
        state: "AWAITING_COMPANY_CONFIRM",
        pending_order: { ...session.pending_order, ncf_type: "B01" }
      });
      await sendCompanyConfirmButtons(phone, customer.company_name, customer.rnc);
    } else {
      await updateSession(phone, {
        state: "AWAITING_RNC",
        pending_order: { ...session.pending_order, ncf_type: "B01" }
      });
      await sendMessage(phone, "💼 ¿Cuál es el *RNC* de tu empresa?");
    }
  } else {
    await sendNCFButtons(phone);
  }
}

async function handleRNCInput(phone, session, input) {
  if (input.length < 9) {
    await sendMessage(phone, "El RNC debe tener al menos 9 dígitos. Escríbelo de nuevo:");
    return;
  }
  await updateSession(phone, {
    state: "AWAITING_COMPANY_NAME",
    pending_order: { ...session.pending_order, rnc: input },
  });
  await sendMessage(phone, "💼 ¿Cuál es el nombre de tu empresa?");
}

async function handleCompanyNameInput(phone, session, input) {
  if (input.length < 2) {
    await sendMessage(phone, "Escribe el nombre de tu empresa 👇");
    return;
  }
  const updatedOrder = { ...session.pending_order, company_name: input };
  await updateSession(phone, { pending_order: updatedOrder });
  // Save RNC and company to customer record if exists
  const customer = await getCustomer(phone);
  if (customer) {
    await supabase.from("customers")
      .update({ rnc: updatedOrder.rnc, company_name: input })
      .eq("whatsapp_phone", phone);
  }
  await createOrderAndCharge(phone, { ...session, pending_order: updatedOrder });
}

async function handleCompanyConfirm(phone, session, input) {
  if (input === "same_company") {
    const customer = await getCustomer(phone);
    const updatedOrder = {
      ...session.pending_order,
      rnc: customer.rnc,
      company_name: customer.company_name,
    };
    await updateSession(phone, { pending_order: updatedOrder });
    await createOrderAndCharge(phone, { ...session, pending_order: updatedOrder });
  } else if (input === "new_company") {
    await updateSession(phone, { state: "AWAITING_RNC" });
    await sendMessage(phone, "💼 ¿Cuál es el nuevo *RNC* de tu empresa?");
  } else {
    const customer = await getCustomer(phone);
    await sendCompanyConfirmButtons(phone, customer.company_name, customer.rnc);
  }
}

async function continueToCustomerInfo(phone, session) {
  const customer = await getCustomer(phone);
  const nameInSession = session.pending_order?.customer_name;

  if (customer) {
    // Returning customer — confirm address, preserve pending_order
    await updateSession(phone, { state: "AWAITING_ADDRESS", pending_order: session.pending_order });
    await sendAddressConfirmButtons(phone, customer.delivery_address);
  } else if (nameInSession) {
    // New customer — we already have their name, just need address
    await updateSession(phone, { state: "AWAITING_ADDRESS", pending_order: session.pending_order });
    await sendMessage(phone, `📍 ¿Cuál es tu calle, número y sector?\n\nEjemplo: _Max Henríquez Ureña 65, Piantini_`);
  } else {
    // New customer — need name first
    await updateSession(phone, { state: "AWAITING_NAME" });
    await sendMessage(phone, `Antes de continuar, ¿cuál es tu nombre completo?`);
  }
}

async function handleNameInput(phone, session, input) {
  if (input.length < 2) {
    await sendMessage(phone, "Escribe tu nombre completo por favor 👇");
    return;
  }
  await updateSession(phone, {
    state: "AWAITING_ADDRESS",
    pending_order: { ...session.pending_order, customer_name: input },
  });
  await sendMessage(phone,
    `Gracias ${input}! 👋\n\n¿Cuál es tu dirección de entrega?\n_(Calle, número, sector, ciudad)_`
  );
}

async function handleAddressInput(phone, session, input) {
  if (input === "same_address") {
    const customer = await getCustomer(phone);
    const addr = customer.delivery_address;
    const zone = checkDeliveryZone(addr);
    const delivery = getDeliveryMessage(zone);
    const updatedOrder = {
      ...session.pending_order,
      delivery_address: addr,
      delivery_zone: extractSector(addr),
      estimated_delivery: delivery ? delivery.estimated : "Por confirmar",
    };
    await updateSession(phone, { state: "AWAITING_NCF", pending_order: updatedOrder });
    await sendNCFButtons(phone);
    return;
  }
  if (input === "new_address") {
    await updateSession(phone, { state: "AWAITING_ADDRESS" });
    await sendMessage(phone, "¿Cuál es la nueva dirección de entrega?\n_(Calle, número, sector, ciudad)_");
    return;
  }
  if (input.length < 5 || !input.includes(',')) {
    await sendMessage(phone,
      `Necesito más detalle 📍\n\nEscribe así: *Calle, número, sector, apartamento*\nEjemplo: _Max Henríquez Ureña 65, Apto 3B, Piantini_`
    );
    return;
  }
  // Save address
  const name = session.pending_order?.customer_name;
  const rnc = session.pending_order?.rnc;
  const company_name = session.pending_order?.company_name;

  // Check zone BEFORE saving — block outside Santo Domingo entirely
  const zone = checkDeliveryZone(input);
  if (zone === "outside") {
    await sendMessage(phone,
      `Lo sentimos 😔 Por el momento solo entregamos en Santo Domingo.\n\n` +
      `Estamos trabajando para llegar a más ciudades muy pronto. ¡Mantente pendiente! 🍗\n\n` +
      `¿Tienes una dirección en Santo Domingo?`
    );
    await sendAddressConfirmButtons(phone, session.pending_order?.delivery_address || input);
    return;
  }

  const delivery = getDeliveryMessage(zone);
  const updatedOrder = {
    ...session.pending_order,
    delivery_address: input,
    delivery_zone: extractSector(input),
    estimated_delivery: delivery ? delivery.estimated : "Por confirmar",
  };
  await updateSession(phone, { state: "AWAITING_ADDRESS_TYPE", pending_order: updatedOrder });
  await sendAddressTypeButtons(phone);
}

async function handleAddressType(phone, session, input) {
  if (input === "type_casa") {
    await updateSession(phone, { state: "AWAITING_REFERENCE", pending_order: { ...session.pending_order, address_type: "casa" } });
    await sendMessage(phone, "📍 ¿Alguna referencia para encontrar tu casa?\n\nEjemplo: _Frente al colmado Don Pepe, casa verde_");
  } else if (input === "type_apto") {
    await updateSession(phone, { state: "AWAITING_TOWER", pending_order: { ...session.pending_order, address_type: "apto" } });
    await sendMessage(phone, "🏢 ¿Cómo se llama el edificio o torre?");
  } else {
    await sendAddressTypeButtons(phone);
  }
}

async function handleTowerInput(phone, session, input) {
  if (input.length < 2) {
    await sendMessage(phone, "Escribe el nombre del edificio o torre 👇");
    return;
  }
  await updateSession(phone, { state: "AWAITING_REFERENCE", pending_order: { ...session.pending_order, tower: input } });
  await sendMessage(phone, "📍 ¿Número de apartamento o piso?\n\nEjemplo: _Apto 3B, Piso 4_");
}

async function handleReferenceInput(phone, session, input) {
  if (input.length < 2) {
    await sendMessage(phone, "Escribe una referencia 👇");
    return;
  }

  let fullAddress = session.pending_order.delivery_address;
  if (session.pending_order.tower) fullAddress += `, ${session.pending_order.tower}`;
  fullAddress += ` (Ref: ${input})`;

  const name = session.pending_order?.customer_name;
  const rnc  = session.pending_order?.rnc;
  const company_name = session.pending_order?.company_name;
  if (name) {
    await upsertCustomer(phone, { name, delivery_address: fullAddress, rnc, company_name });
  } else {
    const customer = await getCustomer(phone);
    if (customer) await upsertCustomer(phone, { name: customer.name, delivery_address: fullAddress, rnc, company_name });
  }

  const updatedOrder = { ...session.pending_order, delivery_address: fullAddress };
  await updateSession(phone, { state: "AWAITING_NCF", pending_order: updatedOrder });
  await sendNCFButtons(phone);
}

async function handleDeliveryConfirm(phone, session, input) {
  if (input === "delivery_yes") {
    await updateSession(phone, { state: "AWAITING_NCF" });
    await sendNCFButtons(phone);
  } else {
    await createSession(phone);
    await sendZoneCheck(phone);
  }
}


// ============================================================
// CATALOG ORDER HANDLER
// ============================================================
async function handleCatalogOrder(phone, order) {
  try {
    // Build selections from catalog items
    const selections = [];
    for (const item of (order?.product_items || [])) {
      const flavor = CATALOG_PRODUCT_MAP[item.product_retailer_id];
      if (!flavor) continue;
      for (let i = 0; i < (item.quantity || 1); i++) {
        selections.push(flavor);
      }
    }

    const totalUnits = selections.length;

    if (totalUnits < 3) {
      await sendMessage(phone,
        `Necesitas mínimo 3 unidades 🍗\nTienes ${totalUnits} — agrega más y vuelve a enviar el carrito.`
      );
      await sendCatalogMessage(phone);
      return;
    }

    const price   = totalUnits * UNIT_PRICE;
    const summary = buildSummary(selections);

    // Get or create session
    let session = await getSession(phone);
    if (!session) {
      await createSession(phone);
      session = await getSession(phone);
    }

    await updateSession(phone, {
      state: "AWAITING_CONFIRM",
      pending_order: {
        pack_size:        totalUnits,
        selections,
        price,
        customer_name:    session?.pending_order?.customer_name,
        delivery_address: session?.pending_order?.delivery_address,
        zone_hint:        session?.pending_order?.zone_hint,
      },
    });

    await sendMessage(phone,
      `🛒 Tu orden:\n\n${summary}\n\n` +
      `Subtotal: RD$${price.toLocaleString()}\n` +
      `Delivery: RD$120\n` +
      `*TOTAL: RD$${(price + 120).toLocaleString()}*`
    );
    await sendConfirmButtons(phone);
  } catch (err) {
    console.error("handleCatalogOrder error:", err);
    await sendMessage(phone, randomError());
  }
}

// ============================================================
// ORDER CREATION & PAYMENT
// ============================================================
async function createOrderAndCharge(phone, session, address) {
  address = address || session.pending_order?.delivery_address;
  const order    = session.pending_order;
  const customer = await getCustomer(phone);

  // Always compute zone from address if not already set
  if (!order.delivery_zone && address) {
    const zone = checkDeliveryZone(address);
    const delivery = getDeliveryMessage(zone);
    order.delivery_zone = extractSector(address);
    order.estimated_delivery = delivery ? delivery.estimated : "Por confirmar";
  }

  const { data: newOrder } = await supabase
    .from("orders")
    .insert({
      customer_id:        customer.id,
      pack_size:          order.pack_size,
      total_price:        order.price + 120,
      status:             "pending",
      delivery_address:   address,
      delivery_zone:      order.delivery_zone || null,
      estimated_delivery: order.estimated_delivery || null,
    })
    .select()
    .single();

  const items = (order.selections || []).map((flavor, i) => ({
    order_id:    newOrder.id,
    unit_number: i + 1,
    flavor,
  }));
  if (items.length > 0) {
    await supabase.from("order_items").insert(items);
  }

  // Use test page if CARDNET_LIVE is not set, otherwise use real CardNet
  const serverUrl = "https://chef-papi-production.up.railway.app";
  const testUrl   = process.env.TEST_PAYMENT_URL || `${serverUrl}/payment.html`;
  const paymentLink = process.env.CARDNET_LIVE === "true"
    ? `https://pay.cardnet.com.do/checkout?order=${newOrder.id}&amount=${order.price + 120}`
    : `${testUrl}?order=${newOrder.id}&amount=${order.price + 120}&server=${serverUrl}`;

  await supabase.from("orders").update({ cardnet_ref: `CN-${newOrder.id}` }).eq("id", newOrder.id);

  await updateSession(phone, {
    state: "AWAITING_PAYMENT",
    pending_order: { ...order, order_id: newOrder.id, payment_link: paymentLink },
  });

  const orderNum = `CP-${String(newOrder.id).padStart(5, "0")}`;

  await sendMessage(phone,
    `🎉 ¡Qué nivel! Tu orden está lista.\n\n` +
    `📋 Orden: *${orderNum}*\n` +
    `📍 Entrega: ${address}\n\n` +
    `💳 *Paga aquí:*\n${paymentLink}\n\n` +
    `⏰ Tienes 30 minutos para pagar.\n\n` +
    `⚠️ _Al calentar, pasa el pollo a un plato primero. No calentar en el envase plástico._\n\n` +
    `Gracias por confiar en Chef Papi 👨‍🍳\n` +
    `Tu proteína está en buenas manos. 💪🍗`
  );
  await sendCancelOrderButton(phone);
}

// ============================================================
// CARDNET PAYMENT WEBHOOK
// ============================================================
app.post("/payment-confirm", async (req, res) => {
  res.sendStatus(200);
  try {
    const { order_id, status, reference } = req.body;
    if (status !== "APPROVED") return;

    await supabase.from("orders").update({ status: "paid", cardnet_ref: reference }).eq("id", order_id);

    const { data: order } = await supabase
      .from("orders")
      .select("*, customers(*)")
      .eq("id", order_id)
      .single();

    // Fetch order_items separately to avoid race condition
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    order.order_items = orderItems || [];

    const phone    = order.customers.whatsapp_phone;
    const orderNum = `CP-${String(order_id).padStart(5, "0")}`;
    const summary  = buildSummary((order.order_items || []).map(i => i.flavor));

    // Build delivery time line based on zone + current time
    let deliveryLine = "";
    if (order.delivery_zone) {
      const deliveryInfo = getDeliveryMessage(order.delivery_zone);
      if (deliveryInfo) {
        deliveryLine = `\n⏱️ ${deliveryInfo.confirmation}`;
      }
    }
    if (!deliveryLine && order.estimated_delivery) {
      deliveryLine = `\n⏱️ Tiempo estimado: ${order.estimated_delivery}`;
    }

    await sendMessage(phone,
      `✅ *¡Pagó y todo!* Gracias ${order.customers.name} 🙌\n\n` +
      `📋 *${orderNum}*\n${summary}\n\n` +
      `🔥 Tu pollo está siendo preparado con amor.\n` +
      `Te avisamos cuando esté en camino 🛵` +
      `${deliveryLine}\n\n` +
      `⚠️ _Al calentar, pasa el pollo a un plato primero._\n\n` +
      `Buen provecho y gracias por elegir Chef Papi 👨‍🍳🍗`
    );

    await updateSession(phone, { state: "DONE", pending_order: null });
    await sendDoneButtons(phone);

    // Notify MBE via Google Sheets
    console.log("Calling notifyMBE for order:", orderNum);
    await notifyMBE(order, orderNum);
    console.log("notifyMBE completed for order:", orderNum);

  } catch (err) {
    console.error("Payment confirm error:", err);
  }
});

// ============================================================
// MBE GOOGLE SHEETS NOTIFICATION
// ============================================================
async function notifyMBE(order, orderNum) {
  try {
    const SHEETS_WEBHOOK = process.env.SHEETS_WEBHOOK_URL;
    console.log("notifyMBE called, webhook URL exists:", !!SHEETS_WEBHOOK);
    if (!SHEETS_WEBHOOK) return;

    const itemCounts = {};
    for (const i of order.order_items) {
      const key = i.flavor;
      itemCounts[key] = (itemCounts[key] || 0) + 1;
    }
    const summary = Object.entries(itemCounts)
      .map(([flavor, count]) => {
        const f = FLAVORS[flavor];
        return count > 1 ? `${f?.emoji} ${f?.title} x${count}` : `${f?.emoji} ${f?.title}`;
      })
      .join(", ");
    const now = getSDTime();
    const pad = n => String(n).padStart(2, "0");
    const hours24 = now.getHours();
    const hours12 = hours24 % 12 || 12;
    const ampm = hours24 < 12 ? "AM" : "PM";
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${hours12}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm} (Santo Domingo)`;

    await fetch(SHEETS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_number:       orderNum,
        customer_name:      order.customers.name,
        phone:              order.customers.whatsapp_phone,
        address:            order.delivery_address,
        items:              summary,
        pack_size:          order.pack_size,
        total:              `RD$${order.total_price.toLocaleString()}`,
        delivery_zone:      order.delivery_zone || "Por confirmar",
        estimated_delivery: order.estimated_delivery || "Por confirmar",
        timestamp:          timeStr,
        status:             "PAGADO",
      }),
    });
  } catch (err) {
    console.error("MBE notification error:", err);
  }
}

// ============================================================
// AI QUESTION HANDLER
// ============================================================
async function askAI(question) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system:     CHEF_PAPI_KNOWLEDGE,
        messages:   [{ role: "user", content: question }],
      }),
    });
    const data = await response.json();
    return data.content?.[0]?.text || "Ay, no tengo esa info ahora mismo 😅 Escríbele al equipo y te ayudan enseguida 👇";
  } catch (err) {
    console.error("AI error:", err);
    return "Ay, algo pasó de mi lado 😅 Escríbele al equipo directamente 👇";
  }
}

function isQuestion(input) {
  if (!input) return false;
  const commands = [
    "3","5","8","10","confirm","change",
    "same_address","new_address","ncf_b01","ncf_b02","human",
    "zone_yes","zone_no","cancel_order",
    "type_casa","type_apto","company_name",
    "same_company","new_company",
    "delivery_yes","delivery_no","district_yes","district_no","district_unsure"
  ];
  if (commands.includes(input)) return false;
  if (Object.keys(FLAVORS).includes(input)) return false;
  if (!isNaN(parseInt(input))) return false;
  return true;
}

// ============================================================
// SESSION TIMEOUT
// ============================================================
async function isSessionExpired(session) {
  if (!session?.updated_at) return false;
  const lastActive = new Date(session.updated_at);
  const now        = new Date();
  const minutes    = (now - lastActive) / 1000 / 60;
  return minutes >= SESSION_TIMEOUT_MINUTES;
}

// ============================================================
// WHATSAPP SENDERS
// ============================================================
async function sendWA(phone, body) {
  await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone, ...body }),
  });
}

async function sendMessage(phone, text) {
  await sendWA(phone, { type: "text", text: { body: text } });
}

async function sendZoneCheck(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: "Chef Papi 🍗" },
      body:   { text: "¡Hola! Bienvenido a Chef Papi 👨‍🍳\n\nAntes de empezar — ¿estás en *Santo Domingo*?" },
      footer: { text: "Solo entregamos en Santo Domingo por ahora." },
      action: {
        buttons: [
          { type: "reply", reply: { id: "zone_yes", title: "✅ Sí, estoy en SD" } },
          { type: "reply", reply: { id: "zone_no",  title: "❌ No, estoy fuera"  } },
        ],
      },
    },
  });
}

async function sendWelcome(phone) {
  const customer = await getCustomer(phone);
  const greeting = customer
    ? `¡Qué lo qué ${customer.name}! 👋\nEscoge tus sabores — mínimo 3 unidades. Mezcla como quieras 🍗`
    : `¡Brutal! Vamos a hacer tu orden.\nEscoge tus sabores — mínimo 3 unidades. Mezcla como quieras 🍗`;
  await sendMessage(phone, greeting);
  await sendCatalogMessage(phone);
}

async function sendCatalogMessage(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "product_list",
      header: { type: "text", text: "Chef Papi 🍗" },
      body:   { text: "Escoge tus sabores 👇\nRD$290 por unidad · Mínimo 3 · Delivery RD$120" },
      action: {
        catalog_id: CATALOG_ID,
        sections: [{
          title: "Nuestros sabores",
          product_items: [
            { product_retailer_id: "1p7bh0r1kc" },
            { product_retailer_id: "xnf2veolk3" },
            { product_retailer_id: "4ihnitfbi4" },
            { product_retailer_id: "ujflq59q37" },
          ],
        }],
      },
    },
  });
}

async function sendFlavorList(phone, unidadesLeft) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: `Te quedan ${unidadesLeft} unidades` },
      body:   { text: "¿Qué sabor quieres agregar?" },
      action: {
        button: "Ver sabores 🍗",
        sections: [{
          title: "Sabores disponibles",
          rows: Object.entries(FLAVORS).map(([id, f]) => ({
            id,
            title: `${f.emoji} ${f.title}`,
          })),
        }],
      },
    },
  });
}

async function sendConfirmButtons(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Confirmamos esta orden?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "confirm", title: "✅ Confirmar" } },
          { type: "reply", reply: { id: "change",  title: "🔄 Cambiar"   } },
        ],
      },
    },
  });
}

async function sendNCFButtons(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "🧾 ¿Necesitas factura con NCF?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "ncf_b02", title: "Consumidor final"    } },
          { type: "reply", reply: { id: "ncf_b01", title: "Con RNC empresa" } },
        ],
      },
    },
  });
}

async function sendAddressConfirmButtons(phone, address) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `¿Entregamos en la misma dirección?\n\n📍 ${address}` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "same_address", title: "✅ Misma dirección" } },
          { type: "reply", reply: { id: "new_address",  title: "📍 Nueva dirección"     } },
        ],
      },
    },
  });
}

async function sendDoneButtons(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Necesitas algo más? 👨‍🍳" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "human", title: "💬 Hablar con equipo" } },
        ],
      },
    },
  });
}

async function sendHumanButton(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Necesitas hablar con alguien del equipo?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "human", title: "💬 Contactar equipo" } },
        ],
      },
    },
  });
}

async function sendHumanHandoff(phone) {
  await sendMessage(phone,
    `¡Claro! Aquí te conecto con el equipo de Chef Papi 👨‍🍳\n\n` +
    `📱 Escríbenos directo:\nwa.me/18098831687\n\n` +
    `Estamos disponibles para ayudarte. ¡Hasta luego! 🍗`
  );
}

// ============================================================
// DATABASE HELPERS
// ============================================================
async function getSession(phone) {
  const { data, error } = await supabase.from("sessions").select("*").eq("phone", phone).maybeSingle();
  if (error) console.error("getSession error:", error);
  return data || null;
}

async function createSession(phone) {
  const { data } = await supabase
    .from("sessions")
    .upsert({ phone, state: "AWAITING_ZONE", pending_order: null, updated_at: new Date().toISOString() })
    .select()
    .single();
  return data;
}

async function updateSession(phone, updates) {
  await supabase
    .from("sessions")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("phone", phone);
}

async function getCustomer(phone) {
  const { data, error } = await supabase.from("customers").select("*").eq("whatsapp_phone", phone).maybeSingle();
  if (error) console.error("getCustomer error:", error);
  return data || null;
}

async function upsertCustomer(phone, { name, delivery_address, rnc, company_name }) {
  const existing = await getCustomer(phone);
  if (existing) {
    // Update existing customer
    const updates = { delivery_address };
    if (name) updates.name = name;
    if (rnc) updates.rnc = rnc;
    if (company_name) updates.company_name = company_name;
    const { error } = await supabase.from("customers").update(updates).eq("whatsapp_phone", phone);
    if (error) console.error("upsertCustomer update error:", error);
  } else {
    // Insert new customer
    const data = { whatsapp_phone: phone, name, delivery_address };
    if (rnc) data.rnc = rnc;
    if (company_name) data.company_name = company_name;
    const { error } = await supabase.from("customers").insert(data);
    if (error) console.error("upsertCustomer insert error:", error);
  }
}


// ============================================================
// UTILS
// ============================================================
function buildSummary(selections) {
  const counts = {};
  for (const f of selections) {
    if (f) counts[f] = (counts[f] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([id, qty]) => {
      const flavor = FLAVORS[id];
      if (!flavor) return `${id} x${qty}`;
      return qty > 1 ? `${flavor.emoji} ${flavor.title} x${qty}` : `${flavor.emoji} ${flavor.title}`;
    })
    .join("\n");
}

// ============================================================
// DISTRICT BUTTONS
// ============================================================
async function sendDistrictButtons(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: "Chef Papi 🍗" },
      body: { text: "¿Estás dentro del Distrito Nacional?" },
      footer: { text: "Esto nos ayuda a darte el tiempo de entrega." },
      action: {
        buttons: [
          { type: "reply", reply: { id: "district_yes",    title: "✅ Sí, Distrito" } },
          { type: "reply", reply: { id: "district_no",     title: "📍 No, fuera"    } },
          { type: "reply", reply: { id: "district_unsure", title: "❓ No estoy seguro"} },
        ],
      },
    },
  });
}

// ============================================================
// DELIVERY CONFIRM BUTTONS
// ============================================================
async function sendDeliveryConfirmButtons(phone, message) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `${message}\n\n¿Continuamos con tu orden?` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "delivery_yes", title: "✅ Sí, continuar" } },
          { type: "reply", reply: { id: "delivery_no",  title: "❌ No, cancelar"  } },
        ],
      },
    },
  });
}

// ============================================================
// ADDRESS TYPE BUTTONS
// ============================================================
async function sendAddressTypeButtons(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Es casa o apartamento?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "type_casa", title: "🏠 Casa" } },
          { type: "reply", reply: { id: "type_apto", title: "🏢 Apartamento" } },
        ],
      },
    },
  });
}

// ============================================================
// COMPANY CONFIRM BUTTONS
// ============================================================
async function sendCompanyConfirmButtons(phone, companyName, rnc) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: "💼 Datos empresariales" },
      body: { text: `¿Facturamos a la misma empresa?\n\n*${companyName}*\nRNC: ${rnc}` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "same_company", title: "✅ Misma empresa" } },
          { type: "reply", reply: { id: "new_company",  title: "🔄 Nueva empresa" } },
        ],
      },
    },
  });
}

// ============================================================
// CANCEL ORDER BUTTON
// ============================================================
async function sendCancelOrderButton(phone) {
  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Quieres cambiar tu orden?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "cancel_order", title: "🔄 Cambiar orden" } },
        ],
      },
    },
  });
}

// ============================================================
// ADMIN HELPERS
// ============================================================
function getWeekRange(weekParam) {
  const pad = n => String(n).padStart(2, "0");
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

  const sdNow = getSDTime();
  const dow = sdNow.getDay(); // 0=Sun
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const thisMon = new Date(sdNow);
  thisMon.setDate(thisMon.getDate() - daysToMon);
  thisMon.setHours(0, 0, 0, 0);

  let monday;
  if (weekParam) {
    const [y, m, d] = weekParam.split("-").map(Number);
    monday = new Date(thisMon);
    monday.setFullYear(y, m - 1, d);
    monday.setHours(0, 0, 0, 0);
  } else {
    monday = thisMon;
  }

  const sunday   = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  const nextMon  = new Date(monday); nextMon.setDate(nextMon.getDate() + 7);
  const prevMon  = new Date(monday); prevMon.setDate(prevMon.getDate() - 7);

  // SD is UTC-4; midnight SD = 04:00 UTC
  const startISO = new Date(monday.getTime() + 4 * 3600000).toISOString();
  const endISO   = new Date(nextMon.getTime() + 4 * 3600000).toISOString();
  const label    = `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`;

  return { startISO, endISO, label,
    prevStr: fmtDate(prevMon),
    nextStr: fmtDate(nextMon),
    isCurrentWeek: fmtDate(monday) === fmtDate(thisMon) };
}

// ============================================================
// ADMIN PAGE
// ============================================================
app.get("/admin", async (req, res) => {
  const pass = req.query.pass;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.send(`
      <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111">
      <form style="background:#222;padding:40px;border-radius:12px;display:flex;flex-direction:column;gap:16px;min-width:300px">
        <h2 style="color:white;margin:0">🍗 Chef Papi Admin</h2>
        <input name="pass" type="password" placeholder="Contraseña" style="padding:12px;border-radius:8px;border:none;font-size:16px"/>
        <button type="submit" style="padding:12px;background:#f97316;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer">Entrar</button>
      </form></body></html>
    `);
  }

  try {
    const week = getWeekRange(req.query.week);

    const { data: allWeekOrders } = await supabase
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .gte("created_at", week.startISO)
      .lt("created_at", week.endISO)
      .order("created_at", { ascending: false });

    // Hot traffic: cancelled orders from last 7 days (all weeks, not just this one)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: hotTrafficOrders } = await supabase
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .eq("status", "cancelled")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false });

    const tab            = req.query.tab || "active";
    const activeOrders   = (allWeekOrders || []).filter(o => o.status !== "cancelled");
    const cancelledOrders= (allWeekOrders || []).filter(o => o.status === "cancelled");
    const orders         = tab === "cancelled" ? cancelledOrders : activeOrders;

    const statusColor = s => {
      if (s === "entregado") return "#22c55e";
      if (s === "en_curso")  return "#3b82f6";
      if (s === "paid")      return "#f97316";
      if (s === "pending")   return "#eab308";
      if (s === "cancelled") return "#ef4444";
      return "#6b7280";
    };

    // Group orders by day
    const byDay = {};
    for (const o of (orders || [])) {
      const dayKey = new Date(o.created_at).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo", weekday: "long", year: "numeric", month: "long", day: "numeric" });
      if (!byDay[dayKey]) byDay[dayKey] = [];
      byDay[dayKey].push(o);
    }

    const rows = Object.entries(byDay).map(([day, dayOrders]) => {
      const dayRevenue = dayOrders.filter(o => ["paid","entregado"].includes(o.status)).reduce((s, o) => s + (o.total_price || 0), 0);
      const orderRows = dayOrders.map(o => {
        const flavors  = (o.order_items || []).map(i => `${FLAVORS[i.flavor]?.emoji || ""} ${FLAVORS[i.flavor]?.title || i.flavor}`).join(", ");
        const timeOnly = new Date(o.created_at).toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo", hour: "2-digit", minute: "2-digit" });
        const orderNum = `CP-${String(o.id).padStart(5,"0")}`;
        const actionBtn = ["paid","sent"].includes(o.status) ? `
          <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
            <input id="track-${o.id}" type="text" placeholder="Link rastreo (opcional)"
              style="padding:5px 8px;border-radius:6px;border:none;background:#333;color:#eee;font-size:11px;width:170px"/>
            <button onclick="enviarLink(${o.id},'${orderNum}','${o.customers?.whatsapp_phone || ""}','${pass}')"
              style="background:#3b82f6;color:white;border:none;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">
              📍 Enviar Link
            </button>
          </div>` : o.status === "en_curso" ? `
          <div style="margin-top:6px">
            <button onclick="marcarEntregado(${o.id},'${orderNum}','${o.customers?.whatsapp_phone || ""}','${pass}')"
              style="background:#22c55e;color:white;border:none;padding:5px 14px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">
              ✅ Marcar Entregado
            </button>
          </div>` : "";
        return `
          <tr id="row-${o.id}" style="border-bottom:1px solid #2a2a2a">
            <td><input type="checkbox" class="order-cb" data-id="${o.id}" onchange="updateBulkBtn()" style="cursor:pointer;width:15px;height:15px"/></td>
            <td style="font-weight:bold">${orderNum}</td>
            <td>${o.customers?.name || "-"}</td>
            <td>${o.customers?.whatsapp_phone || "-"}</td>
            <td>${o.delivery_address || "-"}</td>
            <td>${flavors || "-"}</td>
            <td>${o.pack_size}</td>
            <td>RD$${(o.total_price || 0).toLocaleString()}</td>
            <td>${o.delivery_zone || "-"}</td>
            <td>${o.estimated_delivery || "-"}</td>
            <td>
              <span style="background:${statusColor(o.status)};color:white;padding:3px 10px;border-radius:20px;font-size:12px">${o.status}</span>
              ${actionBtn}
            </td>
            <td style="color:#999;font-size:12px">${timeOnly}</td>
            <td>
              <button onclick="deleteOrder(${o.id},'${orderNum}','${pass}')"
                style="background:#ef4444;color:white;border:none;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer">
                🗑️
              </button>
            </td>
          </tr>`;
      }).join("");

      return `
        <tr>
          <td colspan="12" style="background:#1e1e1e;padding:12px 16px;border-top:2px solid #333">
            <span style="color:#f97316;font-weight:bold;font-size:14px;text-transform:capitalize">${day}</span>
            <span style="color:#666;font-size:12px;margin-left:12px">${dayOrders.length} orden${dayOrders.length !== 1 ? "es" : ""}</span>
            ${dayRevenue > 0 ? `<span style="color:#22c55e;font-size:12px;margin-left:12px">RD$${dayRevenue.toLocaleString()}</span>` : ""}
          </td>
        </tr>
        ${orderRows}`;
    }).join("");

    const paidOrders      = (orders || []).filter(o => o.status === "paid");
    const entregadoOrders = (orders || []).filter(o => o.status === "entregado");
    const weekRevenue     = [...paidOrders, ...entregadoOrders].reduce((sum, o) => sum + (o.total_price || 0), 0);

    const nextLink = week.isCurrentWeek ? "" : `<a class="nav-btn" href="/admin?pass=${pass}&week=${week.nextStr}">Siguiente →</a>`;

    res.send(`
      <html>
      <head>
        <title>Chef Papi Admin</title>
        <meta charset="utf-8"/>
        <style>
          body { font-family: sans-serif; background: #111; color: #eee; margin: 0; padding: 20px; }
          h1 { color: #f97316; margin-bottom: 4px; }
          .week-nav { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
          .nav-btn { background:#333; color:#eee; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; text-decoration:none; }
          .nav-btn:hover { background:#444; }
          .week-label { color:#f97316; font-size:16px; font-weight:bold; }
          .stats { display: flex; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
          .stat { background: #222; border-radius: 12px; padding: 20px 30px; min-width: 140px; }
          .stat-num { font-size: 32px; font-weight: bold; color: #f97316; }
          .stat-label { color: #999; font-size: 14px; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 12px; overflow: hidden; font-size: 13px; }
          th { background: #222; padding: 12px 10px; text-align: left; color: #f97316; font-size: 12px; text-transform: uppercase; }
          td { padding: 10px; vertical-align: top; }
          tr:hover { background: #222; }
          .action-btn { background: #f97316; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; text-decoration: none; display:inline-block; }
          .empty { text-align:center; color:#555; padding:60px 20px; font-size:16px; }
          @media print {
            body { background: white; color: black; padding: 10px; }
            .week-nav, .stats, .no-print { display: none !important; }
            table { font-size: 11px; }
            th { background: #eee !important; color: black !important; }
            td { padding: 6px !important; }
            h1 { color: black !important; font-size: 18px; }
            .print-header { display: block !important; }
          }
          .print-header { display: none; }
        </style>
        <script>
          async function testWebhook(pass) {
            const btn = event.target;
            btn.disabled = true; btn.textContent = 'Enviando...';
            try {
              const res = await fetch('/admin/test-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pass })
              });
              const data = await res.json();
              if (data.ok) {
                alert('✅ Webhook enviado! Revisa tu Excel/Zapier ahora.');
              } else {
                alert('❌ Error: ' + (data.error || 'Unknown'));
              }
            } catch(e) { alert('❌ Error de conexión'); }
            btn.disabled = false; btn.textContent = '🧪 Test Webhook';
          }

          function updateBulkBtn() {
            const count = document.querySelectorAll('.order-cb:checked').length;
            const btn = document.getElementById('bulk-delete-btn');
            if (!btn) return;
            btn.style.display = count > 0 ? 'inline-block' : 'none';
            btn.textContent = '🗑️ Eliminar seleccionadas (' + count + ')';
          }

          function toggleAll(master) {
            document.querySelectorAll('.order-cb').forEach(cb => cb.checked = master.checked);
            updateBulkBtn();
          }

          async function bulkDelete(pass) {
            const checked = Array.from(document.querySelectorAll('.order-cb:checked'));
            if (!checked.length) { alert('Selecciona al menos una orden.'); return; }
            if (!confirm('⚠️ ¿Eliminar ' + checked.length + ' orden(es)? Esta acción no se puede deshacer.')) return;
            const pwd = prompt('Contraseña para confirmar:');
            if (!pwd) return;
            if (pwd !== pass) { alert('Contraseña incorrecta.'); return; }
            const ids = checked.map(cb => parseInt(cb.dataset.id));
            try {
              const res = await fetch('/admin/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_ids: ids, pass })
              });
              const data = await res.json();
              if (data.ok) {
                checked.forEach(cb => { const row = cb.closest('tr'); if (row) row.remove(); });
                updateBulkBtn();
                document.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
              } else {
                alert('Error: ' + (data.error || 'Unknown'));
              }
            } catch(e) { alert('Error de conexión'); }
          }

          async function deleteOrder(orderId, orderNum, pass) {
            if (!confirm('⚠️ ¿Eliminar la orden ' + orderNum + '? Esta acción no se puede deshacer.')) return;
            const pwd = prompt('Escribe tu contraseña para confirmar:');
            if (!pwd) return;
            if (pwd !== pass) { alert('Contraseña incorrecta.'); return; }
            try {
              const res = await fetch('/admin/delete-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, pass })
              });
              const data = await res.json();
              if (data.ok) {
                const row = document.getElementById('row-' + orderId);
                if (row) row.remove();
              } else {
                alert('Error: ' + (data.error || 'Unknown error'));
              }
            } catch(e) { alert('Error de conexión'); }
          }

          async function enviarLink(orderId, orderNum, phone, pass) {
            const trackingLink = document.getElementById('track-' + orderId)?.value?.trim() || '';
            if (!confirm('¿Enviar link y marcar ' + orderNum + ' como En Curso?')) return;
            const btn = event.target;
            btn.disabled = true; btn.textContent = 'Enviando...';
            try {
              const res = await fetch('/admin/send-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, order_num: orderNum, phone, pass, tracking_link: trackingLink })
              });
              const data = await res.json();
              if (data.ok) {
                window.location.reload();
              } else {
                alert('Error: ' + (data.error || 'Unknown error'));
                btn.disabled = false; btn.textContent = '📍 Enviar Link';
              }
            } catch(e) {
              alert('Error de conexión');
              btn.disabled = false; btn.textContent = '📍 Enviar Link';
            }
          }

          async function marcarEntregado(orderId, orderNum, phone, pass) {
            if (!confirm('¿Marcar ' + orderNum + ' como entregado?')) return;
            const btn = event.target;
            btn.disabled = true; btn.textContent = 'Enviando...';
            try {
              const res = await fetch('/admin/deliver', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, order_num: orderNum, phone, pass })
              });
              const data = await res.json();
              if (data.ok) {
                window.location.reload();
              } else {
                alert('Error: ' + (data.error || 'Unknown error'));
                btn.disabled = false; btn.textContent = '✅ Marcar Entregado';
              }
            } catch(e) {
              alert('Error de conexión');
              btn.disabled = false; btn.textContent = '✅ Marcar Entregado';
            }
          }
        </script>
      </head>
      <body>
        <h1>🍗 Chef Papi — Órdenes</h1>
        <div class="week-nav">
          <a class="nav-btn" href="/admin?pass=${pass}&week=${week.prevStr}">← Semana anterior</a>
          <span class="week-label">📅 ${week.label}</span>
          ${nextLink}
          <a class="nav-btn" href="/admin?pass=${pass}">Hoy</a>
          <a class="action-btn" href="/admin/analytics?pass=${pass}">📊 Análisis mensual</a>
          <a href="/admin/export-csv?pass=${pass}&week=${req.query.week||''}" class="nav-btn no-print" style="background:#22c55e;color:white">📥 Exportar CSV</a>
          <button onclick="window.print()" class="nav-btn no-print">🖨️ Imprimir</button>
          <button onclick="testWebhook('${pass}')" class="nav-btn no-print" style="background:#6b7280;color:white;border:none;cursor:pointer">🧪 Test Webhook</button>
          <a class="nav-btn" href="/admin?pass=${pass}&week=${req.query.week||''}&tab=${tab}">🔄 Actualizar</a>
        </div>
        <div class="print-header" style="margin-bottom:16px">
          <strong>Chef Papi — Órdenes</strong> &nbsp;|&nbsp; Semana: ${week.label} &nbsp;|&nbsp; ${tab === "cancelled" ? "Canceladas" : "Activas"}
        </div>
        <div class="no-print" style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
          <a href="/admin?pass=${pass}&week=${req.query.week||''}&tab=active"
            style="padding:7px 18px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:bold;
              ${tab==="active" ? "background:#f97316;color:white" : "background:#222;color:#aaa"}">
            ✅ Activas (${activeOrders.length})
          </a>
          <a href="/admin?pass=${pass}&week=${req.query.week||''}&tab=cancelled"
            style="padding:7px 18px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:bold;
              ${tab==="cancelled" ? "background:#ef4444;color:white" : "background:#222;color:#aaa"}">
            ❌ Canceladas (${cancelledOrders.length})
          </a>
          <a href="/admin?pass=${pass}&tab=hot"
            style="padding:7px 18px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:bold;
              ${tab==="hot" ? "background:#f59e0b;color:white" : "background:#222;color:#f59e0b"}">
            🔥 Hot Traffic (${(hotTrafficOrders||[]).length})
          </a>
          <button id="bulk-delete-btn" onclick="bulkDelete('${pass}')"
            style="display:none;background:#ef4444;color:white;border:none;padding:7px 16px;border-radius:20px;font-size:13px;cursor:pointer;font-weight:bold">
            🗑️ Eliminar seleccionadas (0)
          </button>
        </div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-num">${(orders||[]).length}</div><div class="stat-label">Órdenes esta semana</div></div>
          <div class="stat"><div class="stat-num">${paidOrders.length}</div><div class="stat-label">Pagadas</div></div>
          <div class="stat"><div class="stat-num">${entregadoOrders.length}</div><div class="stat-label">Entregadas</div></div>
          <div class="stat"><div class="stat-num">RD$${weekRevenue.toLocaleString()}</div><div class="stat-label">Revenue semana</div></div>
        </div>
        ${tab === "hot" ? `
        <p style="color:#f59e0b;font-size:13px;margin:0 0 16px">
          Estos clientes completaron su orden pero no pagaron en los últimos 7 días. Son tu tráfico más caliente — escríbeles directo por WhatsApp.
        </p>
        ${(hotTrafficOrders||[]).length === 0 ? `<div class="empty">No hay hot traffic esta semana. 🎉</div>` : `
        <table>
          <thead><tr>
            <th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Items</th><th>Pack</th><th>Total</th><th>Cuándo abandonó</th><th>Contactar</th>
          </tr></thead>
          <tbody>
            ${(hotTrafficOrders||[]).map(o => {
              const flavors = (o.order_items||[]).map(i => `${FLAVORS[i.flavor]?.emoji||""} ${FLAVORS[i.flavor]?.title||i.flavor}`).join(", ");
              const orderNum = `CP-${String(o.id).padStart(5,"0")}`;
              const when = new Date(o.created_at).toLocaleString("es-DO", { timeZone:"America/Santo_Domingo", weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
              const waLink = `https://wa.me/${o.customers?.whatsapp_phone}?text=${encodeURIComponent(`¡Hola ${o.customers?.name||""}! 👋 Vi que casi completaste tu orden ${orderNum} en Chef Papi. ¿Te puedo ayudar a finalizarla? 🍗`)}`;
              return `
              <tr style="border-bottom:1px solid #2a2a2a">
                <td style="font-weight:bold;color:#f59e0b">${orderNum}</td>
                <td>${o.customers?.name||"-"}</td>
                <td>${o.customers?.whatsapp_phone||"-"}</td>
                <td>${flavors||"-"}</td>
                <td>${o.pack_size}</td>
                <td>RD$${(o.total_price||0).toLocaleString()}</td>
                <td style="color:#999;font-size:12px">${when}</td>
                <td><a href="${waLink}" target="_blank" style="background:#25d366;color:white;padding:5px 10px;border-radius:6px;font-size:11px;text-decoration:none;white-space:nowrap">💬 WhatsApp</a></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`}` : `
        ${(orders||[]).length === 0 ? `<div class="empty">No hay órdenes esta semana.</div>` : `
        <table>
          <thead><tr>
            <th><input type="checkbox" onchange="toggleAll(this)" style="cursor:pointer;width:15px;height:15px"/></th>
            <th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Dirección</th>
            <th>Items</th><th>Pack</th><th>Total</th><th>Zona</th>
            <th>Entrega</th><th>Estado / Acción</th><th>Hora</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`}`}
      </body></html>
    `);
  } catch (err) {
    console.error("Admin error:", err);
    res.send("<h2>Error cargando órdenes</h2>");
  }
});

// ============================================================
// ADMIN ANALYTICS PAGE
// ============================================================
app.get("/admin/analytics", async (req, res) => {
  const pass = req.query.pass;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.redirect(`/admin`);
  }

  try {
    // Last 12 months of all orders
    const since = new Date(); since.setMonth(since.getMonth() - 12);
    const { data: orders } = await supabase
      .from("orders")
      .select("*, order_items(*), customers(name, whatsapp_phone)")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true });

    const allOrders      = (orders || []).filter(o => ["paid","entregado","en_curso"].includes(o.status));
    const cancelledOrders = (orders || []).filter(o => o.status === "cancelled");

    // Group by month
    const byMonth = {};
    for (const o of allOrders) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (!byMonth[key]) byMonth[key] = { orders: [], revenue: 0, packs: {3:0,5:0,8:0}, flavors: {}, cancelled: 0 };
      byMonth[key].orders.push(o);
      byMonth[key].revenue += o.total_price || 0;
      byMonth[key].packs[o.pack_size] = (byMonth[key].packs[o.pack_size] || 0) + 1;
      for (const item of (o.order_items || [])) {
        byMonth[key].flavors[item.flavor] = (byMonth[key].flavors[item.flavor] || 0) + 1;
      }
    }
    for (const o of cancelledOrders) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (!byMonth[key]) byMonth[key] = { orders: [], revenue: 0, packs: {3:0,5:0,8:0}, flavors: {}, cancelled: 0 };
      byMonth[key].cancelled = (byMonth[key].cancelled || 0) + 1;
    }

    // Flavor totals
    const flavorTotals = {};
    for (const o of allOrders) {
      for (const item of (o.order_items || [])) {
        flavorTotals[item.flavor] = (flavorTotals[item.flavor] || 0) + 1;
      }
    }

    // Top customers
    const customerMap = {};
    for (const o of allOrders) {
      const key = o.customers?.whatsapp_phone || "?";
      if (!customerMap[key]) customerMap[key] = { name: o.customers?.name || "-", orders: 0, revenue: 0 };
      customerMap[key].orders++;
      customerMap[key].revenue += o.total_price || 0;
    }
    const topCustomers = Object.values(customerMap).sort((a,b) => b.revenue - a.revenue).slice(0,10);

    const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const maxRevenue = Math.max(...Object.values(byMonth).map(m => m.revenue), 1);

    const monthRows = Object.entries(byMonth).reverse().map(([key, m]) => {
      const [y, mo] = key.split("-");
      const monthName = `${MONTH_NAMES[parseInt(mo)-1]} ${y}`;
      const topFlavor = Object.entries(m.flavors).sort((a,b) => b[1]-a[1])[0];
      const barW = Math.round((m.revenue / maxRevenue) * 200);
      return `
        <tr style="border-bottom:1px solid #2a2a2a">
          <td style="font-weight:bold;white-space:nowrap">${monthName}</td>
          <td style="text-align:center">${m.orders.length}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="background:#f97316;height:14px;border-radius:4px;width:${barW}px;min-width:4px"></div>
              <span>RD$${m.revenue.toLocaleString()}</span>
            </div>
          </td>
          <td style="text-align:center">RD$${m.orders.length ? Math.round(m.revenue / m.orders.length).toLocaleString() : "-"}</td>
          <td style="text-align:center">${m.packs[3]||0} / ${m.packs[5]||0} / ${m.packs[8]||0}</td>
          <td style="text-align:center;color:${m.cancelled > 0 ? "#ef4444" : "#555"}">${m.cancelled || 0}</td>
          <td>${topFlavor ? `${FLAVORS[topFlavor[0]]?.emoji} ${FLAVORS[topFlavor[0]]?.title} (${topFlavor[1]})` : "-"}</td>
        </tr>`;
    }).join("");

    const totalRevenue = allOrders.reduce((s,o) => s + (o.total_price||0), 0);
    const avgOrder     = allOrders.length ? Math.round(totalRevenue / allOrders.length) : 0;

    const flavorBars = Object.entries(flavorTotals).sort((a,b)=>b[1]-a[1]).map(([id, count]) => {
      const f = FLAVORS[id];
      const pct = Math.round((count / Math.max(...Object.values(flavorTotals))) * 100);
      return `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span>${f?.emoji} ${f?.title}</span><span style="color:#999">${count} unidades</span>
          </div>
          <div style="background:#333;border-radius:6px;height:12px">
            <div style="background:#f97316;height:12px;border-radius:6px;width:${pct}%"></div>
          </div>
        </div>`;
    }).join("");

    const customerRows = topCustomers.map((c,i) => `
      <tr style="border-bottom:1px solid #2a2a2a">
        <td style="color:#f97316;font-weight:bold">#${i+1}</td>
        <td>${c.name}</td>
        <td style="text-align:center">${c.orders}</td>
        <td>RD$${c.revenue.toLocaleString()}</td>
      </tr>`).join("");

    res.send(`
      <html>
      <head>
        <title>Chef Papi — Analytics</title>
        <meta charset="utf-8"/>
        <style>
          body { font-family:sans-serif; background:#111; color:#eee; margin:0; padding:20px; }
          h1 { color:#f97316; margin-bottom:4px; }
          h2 { color:#f97316; font-size:16px; margin:32px 0 12px; }
          .stats { display:flex; gap:20px; margin-bottom:24px; flex-wrap:wrap; }
          .stat { background:#222; border-radius:12px; padding:20px 30px; min-width:140px; }
          .stat-num { font-size:32px; font-weight:bold; color:#f97316; }
          .stat-label { color:#999; font-size:14px; margin-top:4px; }
          table { width:100%; border-collapse:collapse; background:#1a1a1a; border-radius:12px; overflow:hidden; font-size:13px; margin-bottom:32px; }
          th { background:#222; padding:12px 10px; text-align:left; color:#f97316; font-size:12px; text-transform:uppercase; }
          td { padding:10px; vertical-align:middle; }
          tr:hover { background:#222; }
          .back { background:#333; color:#eee; padding:8px 16px; border-radius:8px; text-decoration:none; font-size:13px; display:inline-block; margin-bottom:20px; }
          .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
          .card { background:#1a1a1a; border-radius:12px; padding:20px; }
          @media(max-width:700px) { .grid { grid-template-columns:1fr; } }
        </style>
      </head>
      <body>
        <h1>📊 Análisis de Ventas</h1>
        <a class="back" href="/admin?pass=${pass}">← Volver a órdenes</a>
        <p style="color:#666;font-size:13px;margin-top:-8px;margin-bottom:20px">Últimos 12 meses · solo órdenes pagadas/entregadas</p>

        <div class="stats">
          <div class="stat"><div class="stat-num">${allOrders.length}</div><div class="stat-label">Órdenes totales</div></div>
          <div class="stat"><div class="stat-num">RD$${totalRevenue.toLocaleString()}</div><div class="stat-label">Revenue total</div></div>
          <div class="stat"><div class="stat-num">RD$${avgOrder.toLocaleString()}</div><div class="stat-label">Ticket promedio</div></div>
          <div class="stat"><div class="stat-num">${Object.keys(customerMap).length}</div><div class="stat-label">Clientes únicos</div></div>
          <div class="stat"><div class="stat-num" style="color:#ef4444">${cancelledOrders.length}</div><div class="stat-label">Canceladas (12m)</div></div>
        </div>

        <h2>📅 Resumen por mes</h2>
        <table>
          <thead><tr>
            <th>Mes</th><th>Órdenes</th><th>Revenue</th><th>Ticket prom.</th><th>Pack 3/5/8</th><th>Canceladas</th><th>Sabor top</th>
          </tr></thead>
          <tbody>${monthRows}</tbody>
        </table>

        <div class="grid">
          <div class="card">
            <h2 style="margin-top:0">🍗 Sabores más pedidos</h2>
            ${flavorBars}
          </div>
          <div class="card">
            <h2 style="margin-top:0">⭐ Top clientes</h2>
            <table style="margin-bottom:0">
              <thead><tr><th>#</th><th>Cliente</th><th>Órdenes</th><th>Revenue</th></tr></thead>
              <tbody>${customerRows}</tbody>
            </table>
          </div>
        </div>
      </body></html>
    `);
  } catch (err) {
    console.error("Analytics error:", err);
    res.send("<h2>Error cargando analytics</h2>");
  }
});

// ============================================================
// ADMIN SEND LINK (EN CURSO) ENDPOINT
// ============================================================
app.post("/admin/send-link", async (req, res) => {
  const { order_id, order_num, phone, pass, tracking_link } = req.body;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.status(403).json({ error: "No autorizado" });
  }
  try {
    await supabase.from("orders").update({ status: "en_curso" }).eq("id", order_id);

    let waMsg = `🛵 ¡Tu orden ${order_num} está en camino! El motorista está en ruta hacia ti. 🍗`;
    if (tracking_link) waMsg += `\n\n📍 Rastrea tu entrega aquí:\n${tracking_link}`;
    await sendMessage(phone, waMsg);

    res.json({ ok: true });
  } catch (err) {
    console.error("Send link error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN DELIVER ENDPOINT
// ============================================================
app.post("/admin/deliver", async (req, res) => {
  const { order_id, order_num, phone, pass } = req.body;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.status(403).json({ error: "No autorizado" });
  }
  try {
    await supabase.from("orders").update({ status: "entregado" }).eq("id", order_id);

    await sendMessage(phone,
      `✅ ¡Tu orden ${order_num} fue entregada! Esperamos que la disfrutes. Buen provecho 🍗👨‍🍳`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Deliver error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN CSV EXPORT ENDPOINT
// ============================================================
app.get("/admin/export-csv", async (req, res) => {
  const { pass } = req.query;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.status(403).send("No autorizado");
  }
  try {
    const week = getWeekRange(req.query.week);
    const { data: orders } = await supabase
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .gte("created_at", week.startISO)
      .lt("created_at", week.endISO)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });

    const rows = (orders || []).map(o => {
      const flavors = (o.order_items || []).map(i => FLAVORS[i.flavor]?.title || i.flavor).join(" / ");
      const date    = new Date(o.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" });
      const orderNum = `CP-${String(o.id).padStart(5,"0")}`;
      return [
        orderNum,
        o.customers?.name || "",
        o.customers?.whatsapp_phone || "",
        o.delivery_address || "",
        flavors,
        o.pack_size,
        o.total_price || 0,
        o.delivery_zone || "",
        o.estimated_delivery || "",
        o.status,
        date,
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",");
    });

    const header = ["Orden","Cliente","Teléfono","Dirección","Items","Pack","Total","Zona","Entrega estimada","Estado","Fecha"].join(",");
    const csv = [header, ...rows].join("\n");
    const filename = `chef-papi-${week.label.replace(/\s/g,"-")}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("﻿" + csv); // BOM for Excel UTF-8
  } catch (err) {
    console.error("CSV export error:", err);
    res.status(500).send("Error exportando");
  }
});

// ============================================================
// ADMIN TEST WEBHOOK ENDPOINT
// ============================================================
app.post("/admin/test-webhook", async (req, res) => {
  const { pass } = req.body;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.status(403).json({ error: "No autorizado" });
  }
  const SHEETS_WEBHOOK = process.env.SHEETS_WEBHOOK_URL;
  if (!SHEETS_WEBHOOK) {
    return res.status(400).json({ error: "SHEETS_WEBHOOK_URL no está configurado en Railway" });
  }
  try {
    const now = getSDTime();
    const pad = n => String(n).padStart(2, "0");
    const h24 = now.getHours(), h12 = h24 % 12 || 12, ampm = h24 < 12 ? "AM" : "PM";
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${h12}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm} (Santo Domingo)`;
    const response = await fetch(SHEETS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_number:       "CP-TEST",
        customer_name:      "Test Chef Papi",
        phone:              "18091234567",
        address:            "Av. Test 123, Piantini",
        items:              "🧂 Natural x2, 🍅 Pomodoro x1",
        pack_size:          3,
        total:              "RD$990",
        delivery_zone:      "Piantini",
        estimated_delivery: "Hoy 45min - 3 horas",
        timestamp:          timeStr,
        status:             "TEST",
      }),
    });
    console.log("Test webhook response status:", response.status);
    res.json({ ok: true, status: response.status });
  } catch (err) {
    console.error("Test webhook error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN BULK DELETE ENDPOINT
// ============================================================
app.post("/admin/bulk-delete", async (req, res) => {
  const { order_ids, pass } = req.body;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.status(403).json({ error: "No autorizado" });
  }
  if (!Array.isArray(order_ids) || order_ids.length === 0) {
    return res.status(400).json({ error: "No order IDs provided" });
  }
  try {
    await supabase.from("orders").delete().in("id", order_ids);
    res.json({ ok: true, deleted: order_ids.length });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN DELETE ORDER ENDPOINT
// ============================================================
app.post("/admin/delete-order", async (req, res) => {
  const { order_id, pass } = req.body;
  if (pass !== (process.env.ADMIN_PASSWORD || "chefpapi2024")) {
    return res.status(403).json({ error: "No autorizado" });
  }
  try {
    // order_items cascade-deletes via FK, so just delete the order
    await supabase.from("orders").delete().eq("id", order_id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// AUTO-CANCEL ABANDONED ORDERS (runs every 30 min)
// ============================================================
const ABANDON_HOURS = 2; // mark as cancelled after 2h unpaid

async function cancelAbandonedOrders() {
  try {
    const cutoff = new Date(Date.now() - ABANDON_HOURS * 60 * 60 * 1000).toISOString();
    const { data: abandoned } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", cutoff);

    if (!abandoned || abandoned.length === 0) return;

    const ids = abandoned.map(o => o.id);
    await supabase.from("orders").update({ status: "cancelled" }).in("id", ids);
    console.log(`🚫 Auto-cancelled ${ids.length} abandoned order(s):`, ids);
  } catch (err) {
    console.error("Auto-cancel error:", err);
  }
}

// Run once on startup, then every 30 minutes
cancelAbandonedOrders();
setInterval(cancelAbandonedOrders, 30 * 60 * 1000);

// ============================================================
// START
// ============================================================
app.listen(PORT, () => console.log(`🍗 Chef Papi v41 running on port ${PORT}`));
