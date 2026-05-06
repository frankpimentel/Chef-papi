// ============================================================
// CHEF PAPI — WhatsApp Ordering Backend v6
// Stack: Node.js + Express | Supabase | Meta WhatsApp Cloud API
// Features: AI FAQ, Dominican slang, NCF, human handoff,
//           session timeout, delivery zone check
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());

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
  natural:  { title: "Natural Sal & Pimienta",  emoji: "🧂" },
  pomodoro: { title: "Pomodoro",                 emoji: "🍅" },
  pesto:    { title: "Pesto",                    emoji: "🌿" },
  bbq:      { title: "Barbecue",                 emoji: "🔥" },
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

// ── SESSION TIMEOUT (minutes) ────────────────────────────────
const SESSION_TIMEOUT_MINUTES = 10;

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
- Pedidos antes de las 2pm se entregan en 3-4 horas
- Pedidos después de las 2pm se entregan al día siguiente
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
  if (session) {
    const expired = await isSessionExpired(session);
    if (expired) {
      await createSession(phone);
      session = await getSession(phone);
      await sendMessage(phone, "Ay, se fue la conexión 😅 ¡Empecemos de nuevo!");
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
        // Everyone goes straight to pack — address collected at checkout
        await updateSession(phone, { state: "AWAITING_PACK", pending_order: {} });
        await sendWelcome(phone);
      } else if (isNo) {
        await sendMessage(phone,
          `Ay, qué pena 😔 Por el momento solo entregamos en *Santo Domingo*.\n\n` +
          `¡Pronto llegamos a más ciudades! Mantente pendiente 🍗`
        );
        await createSession(phone);
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

    case "DONE":
      if (input === "reorder" || input === "new_order") {
        await handleReorderOrNew(phone, session, input);
      } else if (isQuestion(input)) {
        const answer = await askAI(input);
        await sendMessage(phone, answer);
        await sendHumanButton(phone);
      } else {
        await sendDoneButtons(phone);
      }
      break;

    default:
      await createSession(phone);
      await sendZoneCheck(phone);
  }
  } catch (err) {
    console.error("handleMessage error:", err);
    try {
      await sendMessage(phone,
        randomError()
      );
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
    await updateSession(phone, { state: "AWAITING_NCF" });
    await sendNCFButtons(phone);
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
    await continueToCustomerInfo(phone, { ...session, pending_order: updatedOrder });
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
  await continueToCustomerInfo(phone, { ...session, pending_order: updatedOrder });
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
    await continueToCustomerInfo(phone, { ...session, pending_order: updatedOrder });
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
    // Returning customer — confirm address
    await updateSession(phone, { state: "AWAITING_ADDRESS" });
    await sendAddressConfirmButtons(phone, customer.delivery_address);
  } else if (nameInSession) {
    // New customer — we already have their name, just need address
    await updateSession(phone, { state: "AWAITING_ADDRESS" });
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
    await createOrderAndCharge(phone, session, customer.delivery_address);
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
  // Save and go to pack
  const name = session.pending_order?.customer_name;
  const rnc = session.pending_order?.rnc;
  const company_name = session.pending_order?.company_name;
  if (name) {
    // New customer - save name + address + optional company
    await upsertCustomer(phone, { name, delivery_address: input, rnc, company_name });
  } else {
    // Returning customer updating address
    const customer = await getCustomer(phone);
    if (customer) await upsertCustomer(phone, { name: customer.name, delivery_address: input, rnc, company_name });
  }
  await updateSession(phone, {
    state: "AWAITING_PACK",
    pending_order: { delivery_address: input, customer_name: name || null },
  });
  await sendWelcome(phone);
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

  const { data: newOrder } = await supabase
    .from("orders")
    .insert({
      customer_id:      customer.id,
      pack_size:        order.pack_size,
      total_price:      order.price + 120,
      status:           "pending",
      delivery_address: address,
    })
    .select()
    .single();

  const items = order.selections.map((flavor, i) => ({
    order_id:    newOrder.id,
    unit_number: i + 1,
    flavor,
  }));
  await supabase.from("order_items").insert(items);

  const paymentLink = `https://pay.cardnet.com.do/checkout?order=${newOrder.id}&amount=${order.price + 120}`;

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
      .select("*, customers(*), order_items(*)")
      .eq("id", order_id)
      .single();

    const phone    = order.customers.whatsapp_phone;
    const orderNum = `CP-${String(order_id).padStart(5, "0")}`;
    const summary  = buildSummary(order.order_items.map(i => i.flavor));

    await sendMessage(phone,
      `✅ *¡Pagó y todo!* Gracias ${order.customers.name} 🙌\n\n` +
      `📋 *${orderNum}*\n${summary}\n\n` +
      `🔥 Tu pollo está siendo preparado con amor.\n` +
      `Te avisamos cuando esté en camino 🛵\n\n` +
      `⚠️ _Al calentar, pasa el pollo a un plato primero._\n\n` +
      `Buen provecho y gracias por elegir Chef Papi 👨‍🍳🍗`
    );

    await updateSession(phone, { state: "DONE", pending_order: null });
    await sendDoneButtons(phone);

  } catch (err) {
    console.error("Payment confirm error:", err);
  }
});

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
    "8"
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
  const data = { whatsapp_phone: phone, name, delivery_address };
  if (rnc) data.rnc = rnc;
  if (company_name) data.company_name = company_name;
  await supabase.from("customers").upsert(data);
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
  for (const f of selections) counts[f] = (counts[f] || 0) + 1;
  return Object.entries(counts)
    .map(([id, qty]) => `${FLAVORS[id].emoji} ${FLAVORS[id].title} x${qty}`)
    .join("\n");
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
// START
// ============================================================
app.listen(PORT, () => console.log(`🍗 Chef Papi v23 running on port ${PORT}`));
