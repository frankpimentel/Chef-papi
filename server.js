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
  natural:  { title: "Natural Sal & Pimienta",  emoji: "🧂", short: "Natural" },
  pomodoro: { title: "Pomodoro",                 emoji: "🍅", short: "Pomodoro" },
  pesto:    { title: "Pesto",                    emoji: "🌿", short: "Pesto" },
  bbq:      { title: "Barbecue",                 emoji: "🔥", short: "Barbecue" },
};

// ── PRICES ───────────────────────────────────────────────────
const PRICES = { 3: 870, 5: 1450, 8: 2320 };

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
const SILENT_RESET_STATES = ["AWAITING_ZONE", "AWAITING_PACK", "DONE"];

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
- Cada unidad tiene aproximadamente 200g de pollo cocido con ~55g de proteína
- Sabores: Natural (Sal y Pimienta), Pomodoro, Pesto, Barbecue
- NO calentar en el envase plástico. Pasar el pollo a un plato antes de calentar.
- Dura 6 días en la nevera después de descongelado. Nunca romper la cadena de frío.
- Se puede congelar. Para descongelar, poner en la nevera un día antes de comer.
- El pack de 5 resuelve tu proteína toda la semana.

PRECIOS:
- Pack de 3 unidades: RD$870 (RD$290 por unidad)
- Pack de 5 unidades: RD$1,450 (RD$290 por unidad)
- Pack de 8 unidades: RD$2,320 (RD$290 por unidad)
- Delivery: RD$120

ENTREGAS:
- Solo en Santo Domingo por el momento
- Pedidos antes de las 3:30pm se entregan hoy en 45 minutos a 3 horas
- Pedidos después de las 3:30pm se entregan mañana por la mañana
- Solo tarjeta por el momento

CANCELACIONES:
- Una vez la orden está creada y facturada no se puede cancelar ni cambiar

ALÉRGENOS:
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
      // Clean up messages older than 1 hour to keep table small
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await supabase.from("processed_messages").delete().lt("created_at", oneHourAgo);
    }

    const phone = message.from;
    const type  = message.type;

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
      if (input === "reorder" || input === "new_order") {
        await handleReorderOrNew(phone, session, input);
      } else if (isGreeting) {
        await updateSession(phone, { state: "AWAITING_PACK" });
        await sendWelcome(phone);
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

async function handleReorderOrNew(phone, session, input) {
  if (input === "reorder") {
    const lastOrder = await getLastOrder(phone);
    if (!lastOrder) {
      await updateSession(phone, { state: "AWAITING_PACK", pending_order: null });
      await sendWelcome(phone);
      return;
    }
    const summary  = buildSummary(lastOrder.flavors);
    const customer = await getCustomer(phone);
    await updateSession(phone, {
      state: "AWAITING_CONFIRM",
      pending_order: {
        pack_size:        lastOrder.pack_size,
        selections:       lastOrder.flavors,
        price:            PRICES[lastOrder.pack_size],
        customer_name:    customer.name,
        delivery_address: customer.delivery_address,
      },
    });
    await sendMessage(phone,
      `Tu última orden:\n\n${summary}\n\n` +
      `Subtotal: RD$${PRICES[lastOrder.pack_size].toLocaleString()}\n` +
      `Delivery: RD$120\n` +
      `*TOTAL: RD$${(PRICES[lastOrder.pack_size] + 120).toLocaleString()}*`
    );
    await sendConfirmButtons(phone);
  } else {
    await updateSession(phone, { state: "AWAITING_PACK", pending_order: null });
    await sendWelcome(phone);
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
    "3","5","10","confirm","change","reorder","new_order",
    "same_address","new_address","ncf_b01","ncf_b02","human",
    "zone_yes","zone_no","cancel_order",
    "type_casa","type_apto","company_name",
    "same_company","new_company",
    "8","delivery_yes","delivery_no","district_yes","district_no","district_unsure"
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
    ? `¡Qué lo qué ${customer.name}! 👋`
    : "¡Brutal! Vamos a hacer tu orden 🍗";

  await sendWA(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: "Chef Papi 🍗" },
      body:   { text: `${greeting}\nPollo al grill, listo para tu semana.\n\nPack de 3 — Para probar 🍗\nPack de 5 — Tu proteína semanal 💪\nPack de 8 — El atleta serio 🔥\n\nRD$290 por unidad. ¿Cuál quieres?` },
      footer: { text: "Entrega fría. RD$120 delivery." },
      action: {
        buttons: [
          { type: "reply", reply: { id: "3", title: "Pack de 3 — RD$870" } },
          { type: "reply", reply: { id: "5", title: "Pack de 5 — RD$1,450"} },
          { type: "reply", reply: { id: "8", title: "Pack de 8 — RD$2,320"} },
        ],
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
      body: { text: "¿Qué más puedo hacer por ti? 👨‍🍳" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "reorder",   title: "🔄 Repetir orden" } },
          { type: "reply", reply: { id: "new_order", title: "🛒 Nueva orden"          } },
          { type: "reply", reply: { id: "human",     title: "💬 Hablar con equipo"   } },
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

async function getLastOrder(phone) {
  const customer = await getCustomer(phone);
  if (!customer) return null;
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("customer_id", customer.id)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!data) return null;
  return { pack_size: data.pack_size, flavors: data.order_items.map(i => i.flavor) };
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
    const { data: orders } = await supabase
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .order("created_at", { ascending: false })
      .limit(100);

    const rows = (orders || []).map(o => {
      const flavors = (o.order_items || []).map(i => `${FLAVORS[i.flavor]?.emoji || ""} ${FLAVORS[i.flavor]?.title || i.flavor}`).join(", ");
      const date = new Date(o.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" });
      const statusColor = o.status === "paid" ? "#22c55e" : o.status === "cancelled" ? "#ef4444" : "#f97316";
      return `
        <tr style="border-bottom:1px solid #333">
          <td>CP-${String(o.id).padStart(5,"0")}</td>
          <td>${o.customers?.name || "-"}</td>
          <td>${o.customers?.whatsapp_phone || "-"}</td>
          <td>${o.delivery_address || "-"}</td>
          <td>${flavors || "-"}</td>
          <td>${o.pack_size}</td>
          <td>RD$${(o.total_price || 0).toLocaleString()}</td>
          <td>${o.delivery_zone || "-"}</td>
          <td>${o.estimated_delivery || "-"}</td>
          <td><span style="background:${statusColor};color:white;padding:3px 10px;border-radius:20px;font-size:12px">${o.status}</span></td>
          <td style="color:#999;font-size:12px">${date}</td>
        </tr>`;
    }).join("");

    const paidOrders = (orders || []).filter(o => o.status === "paid");
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);

    res.send(`
      <html>
      <head>
        <title>Chef Papi Admin</title>
        <meta charset="utf-8"/>
        <style>
          body { font-family: sans-serif; background: #111; color: #eee; margin: 0; padding: 20px; }
          h1 { color: #f97316; }
          .stats { display: flex; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
          .stat { background: #222; border-radius: 12px; padding: 20px 30px; min-width: 140px; }
          .stat-num { font-size: 32px; font-weight: bold; color: #f97316; }
          .stat-label { color: #999; font-size: 14px; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 12px; overflow: hidden; font-size: 13px; }
          th { background: #222; padding: 12px 10px; text-align: left; color: #f97316; font-size: 12px; text-transform: uppercase; }
          td { padding: 10px; vertical-align: top; }
          tr:hover { background: #222; }
          .refresh { background: #f97316; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; text-decoration: none; margin-bottom: 20px; display: inline-block; }
        </style>
      </head>
      <body>
        <h1>🍗 Chef Papi — Órdenes</h1>
        <div class="stats">
          <div class="stat"><div class="stat-num">${(orders||[]).length}</div><div class="stat-label">Total órdenes</div></div>
          <div class="stat"><div class="stat-num">${paidOrders.length}</div><div class="stat-label">Pagadas</div></div>
          <div class="stat"><div class="stat-num">RD$${totalRevenue.toLocaleString()}</div><div class="stat-label">Revenue total</div></div>
        </div>
        <a class="refresh" href="/admin?pass=${pass}">🔄 Actualizar</a>
        <table>
          <thead><tr>
            <th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Dirección</th>
            <th>Items</th><th>Pack</th><th>Total</th><th>Zona</th>
            <th>Entrega</th><th>Estado</th><th>Fecha</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>
    `);
  } catch (err) {
    console.error("Admin error:", err);
    res.send("<h2>Error cargando órdenes</h2>");
  }
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => console.log(`🍗 Chef Papi v41 running on port ${PORT}`));
