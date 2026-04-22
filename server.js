// ============================================================
// CHEF PAPI — WhatsApp Ordering Backend
// Stack: Node.js + Express | Supabase | Meta WhatsApp Cloud API
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());

// ── ENV VARS (set these in Railway) ─────────────────────────
const {
  WHATSAPP_TOKEN,        // Meta API access token
  WHATSAPP_VERIFY_TOKEN, // Any string you choose for webhook verification
  WHATSAPP_PHONE_ID,     // Your WhatsApp phone number ID from Meta dashboard
  SUPABASE_URL,
  SUPABASE_KEY,
  CARDNET_API_KEY,
  CARDNET_MERCHANT_ID,
  PORT = 3000,
} = process.env;

// ── SUPABASE CLIENT ──────────────────────────────────────────
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── FLAVORS ──────────────────────────────────────────────────
const FLAVORS = {
  none:     { title: "Sin Sabor",  emoji: "🍗" },
  pomodoro: { title: "Pomodoro",   emoji: "🍅" },
  pesto:    { title: "Pesto",      emoji: "🌿" },
  aglio:    { title: "Aglio",      emoji: "🧄" },
  teriyaki: { title: "Teriyaki",   emoji: "🥢" },
  bbq:      { title: "Barbecue",   emoji: "🔥" },
};

// ── PRICES ───────────────────────────────────────────────────
const PRICES = { 3: 850, 5: 1350, 10: 2500 };

// ============================================================
// WHATSAPP VERIFICATION (GET)
// Meta calls this once when you register the webhook
// ============================================================
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
// MAIN WEBHOOK (POST)
// All incoming WhatsApp messages arrive here
// ============================================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Always respond immediately to Meta

  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    const phone = message.from; // Customer's WhatsApp number
    const type  = message.type; // "text" or "interactive"

    // Extract the actual content regardless of message type
    let input = "";
    if (type === "text") {
      input = message.text.body.trim();
    } else if (type === "interactive") {
      // List reply
      if (message.interactive.type === "list_reply") {
        input = message.interactive.list_reply.id;
      }
      // Button reply
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
// CORE: MESSAGE HANDLER
// Loads session, routes to correct state handler
// ============================================================
async function handleMessage(phone, input) {
  // Load or create session
  let session = await getSession(phone);

  if (!session) {
    session = await createSession(phone);
    await sendPackSizeButtons(phone);
    return;
  }

  // Route based on current state
  switch (session.state) {
    case "AWAITING_PACK":
      await handlePackSelection(phone, session, input);
      break;

    case "AWAITING_FLAVOR":
      await handleFlavorSelection(phone, session, input);
      break;

    case "AWAITING_QTY":
      await handleQtyInput(phone, session, input);
      break;

    case "AWAITING_CONFIRM":
      await handleConfirmation(phone, session, input);
      break;

    case "AWAITING_NAME":
      await handleNameInput(phone, session, input);
      break;

    case "AWAITING_ADDRESS":
      await handleAddressInput(phone, session, input);
      break;

    case "AWAITING_PAYMENT":
      await sendMessage(phone, "⏳ Esperando tu pago. Usa este link:\n\n" + session.pending_order.payment_link);
      break;

    case "DONE":
      await handleReorderPrompt(phone, session, input);
      break;

    default:
      await createSession(phone);
      await sendPackSizeButtons(phone);
  }
}

// ============================================================
// STATE HANDLERS
// ============================================================

async function handlePackSelection(phone, session, input) {
  const size = parseInt(input);
  if (![3, 5, 10].includes(size)) {
    await sendPackSizeButtons(phone);
    return;
  }

  await updateSession(phone, {
    state: "AWAITING_FLAVOR",
    pending_order: { pack_size: size, selections: [], price: PRICES[size] },
  });

  await sendMessage(phone, `Pack de ${size} seleccionado ✅\nPrecio: RD$${PRICES[size].toLocaleString()}\n\n¿Qué sabor quieres agregar? Te quedan ${size} slots.`);
  await sendFlavorList(phone, size);
}

async function handleFlavorSelection(phone, session, input) {
  if (!FLAVORS[input]) {
    await sendFlavorList(phone, session.pending_order.pack_size - session.pending_order.selections.length);
    return;
  }

  const flavor   = FLAVORS[input];
  const slotsLeft = session.pending_order.pack_size - session.pending_order.selections.length;

  await updateSession(phone, {
    state: "AWAITING_QTY",
    pending_order: { ...session.pending_order, current_flavor: input },
  });

  await sendMessage(phone, `${flavor.emoji} ${flavor.title} — ¿cuántos quieres? (te quedan ${slotsLeft} slots)`);
}

async function handleQtyInput(phone, session, input) {
  const qty      = parseInt(input);
  const order    = session.pending_order;
  const slotsLeft = order.pack_size - order.selections.length;
  const flavor   = FLAVORS[order.current_flavor];

  if (!qty || qty < 1 || isNaN(qty)) {
    await sendMessage(phone, `Escribe un número entre 1 y ${slotsLeft}.`);
    return;
  }

  if (qty > slotsLeft) {
    await sendMessage(phone, `Solo te quedan ${slotsLeft} slots. ¿Cuántos ${flavor.emoji} ${flavor.title} quieres? (máximo ${slotsLeft})`);
    return;
  }

  // Add selections
  const newSelections = [
    ...order.selections,
    ...Array(qty).fill(order.current_flavor),
  ];

  const remaining = order.pack_size - newSelections.length;

  if (remaining === 0) {
    // Pack is full — show summary
    const updatedOrder = { ...order, selections: newSelections, current_flavor: null };
    await updateSession(phone, { state: "AWAITING_CONFIRM", pending_order: updatedOrder });

    const summary = buildSummary(newSelections);
    await sendMessage(phone,
      `✅ ¡Tu pack está listo!\n\n${summary}\n\nTotal: RD$${PRICES[order.pack_size].toLocaleString()}`
    );
    await sendConfirmButtons(phone);
  } else {
    // More slots remaining
    const updatedOrder = { ...order, selections: newSelections, current_flavor: null };
    await updateSession(phone, { state: "AWAITING_FLAVOR", pending_order: updatedOrder });

    await sendMessage(phone, `✅ Agregado. Te quedan ${remaining} slots.\n¿Qué otro sabor quieres?`);
    await sendFlavorList(phone, remaining);
  }
}

async function handleConfirmation(phone, session, input) {
  if (input === "confirm") {
    // Check if we have customer info
    const customer = await getCustomer(phone);

    if (!customer) {
      await updateSession(phone, { state: "AWAITING_NAME" });
      await sendMessage(phone, "¡Perfecto! Antes de continuar, ¿cuál es tu nombre completo?");
    } else {
      // Returning customer — confirm address
      await updateSession(phone, { state: "AWAITING_ADDRESS_CONFIRM" });
      await sendAddressConfirmButtons(phone, customer.delivery_address);
    }
  } else if (input === "change") {
    const size = session.pending_order.pack_size;
    await updateSession(phone, {
      state: "AWAITING_FLAVOR",
      pending_order: { pack_size: size, selections: [], price: PRICES[size] },
    });
    await sendMessage(phone, `Empecemos de nuevo. Te quedan ${size} slots.`);
    await sendFlavorList(phone, size);
  }
}

async function handleNameInput(phone, session, input) {
  if (input.length < 2) {
    await sendMessage(phone, "Por favor escribe tu nombre completo.");
    return;
  }
  await updateSession(phone, {
    state: "AWAITING_ADDRESS",
    pending_order: { ...session.pending_order, customer_name: input },
  });
  await sendMessage(phone, `Hola ${input}! 👋\n¿Cuál es tu dirección de entrega?`);
}

async function handleAddressInput(phone, session, input) {
  if (input.length < 5) {
    await sendMessage(phone, "Por favor escribe tu dirección completa (calle, sector, ciudad).");
    return;
  }

  // Save customer
  await upsertCustomer(phone, {
    name: session.pending_order.customer_name,
    delivery_address: input,
  });

  await createOrderAndCharge(phone, session, input);
}

async function handleReorderPrompt(phone, session, input) {
  if (input === "reorder") {
    const lastOrder = await getLastOrder(phone);
    if (!lastOrder) {
      await createSession(phone);
      await sendPackSizeButtons(phone);
      return;
    }
    const summary = buildSummary(lastOrder.flavors);
    const customer = await getCustomer(phone);

    // Recreate session with last order
    await updateSession(phone, {
      state: "AWAITING_CONFIRM",
      pending_order: {
        pack_size: lastOrder.pack_size,
        selections: lastOrder.flavors,
        price: PRICES[lastOrder.pack_size],
        customer_name: customer.name,
        delivery_address: customer.delivery_address,
      },
    });

    await sendMessage(phone, `Tu última orden:\n\n${summary}\nTotal: RD$${PRICES[lastOrder.pack_size].toLocaleString()}`);
    await sendConfirmButtons(phone);
  } else {
    await createSession(phone);
    await sendPackSizeButtons(phone);
  }
}

// ============================================================
// ORDER CREATION & PAYMENT
// ============================================================

async function createOrderAndCharge(phone, session, address) {
  const order    = session.pending_order;
  const customer = await getCustomer(phone);

  // 1. Create order in DB
  const { data: newOrder } = await supabase
    .from("orders")
    .insert({
      customer_id:      customer.id,
      pack_size:        order.pack_size,
      total_price:      order.price,
      status:           "pending",
      delivery_address: address,
    })
    .select()
    .single();

  // 2. Save order items
  const items = order.selections.map((flavor, i) => ({
    order_id:    newOrder.id,
    unit_number: i + 1,
    flavor,
  }));
  await supabase.from("order_items").insert(items);

  // 3. Generate CardNET payment link
  const paymentLink = await generateCardnetLink(newOrder.id, order.price);

  // 4. Save payment link to order
  await supabase
    .from("orders")
    .update({ cardnet_ref: paymentLink.ref })
    .eq("id", newOrder.id);

  // 5. Update session
  await updateSession(phone, {
    state: "AWAITING_PAYMENT",
    pending_order: { ...order, order_id: newOrder.id, payment_link: paymentLink.url },
  });

  // 6. Send payment link to customer
  await sendMessage(phone,
    `¡Perfecto! Tu orden está lista 🎉\n\n` +
    `💳 *Link de pago:*\n${paymentLink.url}\n\n` +
    `Tienes 30 minutos para completar el pago.\n` +
    `Una vez confirmado te avisamos cuando salga tu pedido. 🛵`
  );
}

// ============================================================
// CARDNET PAYMENT WEBHOOK
// CardNET calls this when payment is confirmed
// ============================================================
app.post("/payment-confirm", async (req, res) => {
  res.sendStatus(200);

  try {
    const { order_id, status, reference } = req.body;

    if (status !== "APPROVED") return;

    // Update order status
    await supabase
      .from("orders")
      .update({ status: "paid", cardnet_ref: reference })
      .eq("id", order_id);

    // Get order + customer
    const { data: order } = await supabase
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .eq("id", order_id)
      .single();

    const phone = order.customers.whatsapp_phone;

    // Notify customer
    await sendMessage(phone,
      `✅ ¡Pago recibido! Gracias ${order.customers.name} 🙌\n\n` +
      `Tu pedido está siendo preparado. Te avisamos cuando esté en camino. 🛵\n\n` +
      `Número de orden: #CP-${String(order_id).padStart(5, "0")}`
    );

    // Update session to DONE + offer reorder next time
    await updateSession(phone, { state: "DONE", pending_order: null });

    // TODO: Trigger logistics API here when ready
    // await sendToLogistics(order);

  } catch (err) {
    console.error("Payment confirm error:", err);
  }
});

// ============================================================
// WHATSAPP MESSAGE SENDERS
// ============================================================

async function sendMessage(phone, text) {
  await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text },
    }),
  });
}

async function sendPackSizeButtons(phone) {
  await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "text", text: "Chef Papi 🍗" },
        body: { text: "¡Hola! Pollo listo para tu semana.\n\n¿Qué pack quieres hoy?" },
        footer: { text: "Entrega fría. Come toda la semana." },
        action: {
          buttons: [
            { type: "reply", reply: { id: "3",  title: "3 units — RD$850"   } },
            { type: "reply", reply: { id: "5",  title: "5 units — RD$1,350" } },
            { type: "reply", reply: { id: "10", title: "10 units — RD$2,500"} },
          ],
        },
      },
    }),
  });
}

async function sendFlavorList(phone, slotsLeft) {
  await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: `Slots restantes: ${slotsLeft}` },
        body: { text: "¿Qué sabor quieres agregar?" },
        action: {
          button: "Ver sabores",
          sections: [{
            title: "Sabores disponibles",
            rows: Object.entries(FLAVORS).map(([id, f]) => ({
              id,
              title: `${f.emoji} ${f.title}`,
            })),
          }],
        },
      },
    }),
  });
}

async function sendConfirmButtons(phone) {
  await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "¿Confirmamos esta orden?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "confirm", title: "✅ Confirmar"   } },
            { type: "reply", reply: { id: "change",  title: "🔄 Cambiar"     } },
          ],
        },
      },
    }),
  });
}

async function sendAddressConfirmButtons(phone, address) {
  await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: `¿Entregamos en la misma dirección?\n\n📍 ${address}` },
        action: {
          buttons: [
            { type: "reply", reply: { id: "same_address", title: "✅ Sí, misma dirección" } },
            { type: "reply", reply: { id: "new_address",  title: "📍 Nueva dirección"     } },
          ],
        },
      },
    }),
  });
}

// ============================================================
// CARDNET INTEGRATION (stub — replace with real API)
// ============================================================

async function generateCardnetLink(orderId, amount) {
  // TODO: Replace with real CardNET API call
  // CardNET sandbox: https://sandbox.cardnet.com.do
  // Docs: Request a payment link with order_id, amount, currency, callback_url

  // For now returns a mock link for testing
  return {
    url: `https://pay.cardnet.com.do/checkout?order=${orderId}&amount=${amount}&currency=DOP&callback=${encodeURIComponent("https://your-backend.railway.app/payment-confirm")}`,
    ref: `CN-${orderId}-${Date.now()}`,
  };
}

// ============================================================
// DATABASE HELPERS
// ============================================================

async function getSession(phone) {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("phone", phone)
    .single();
  return data;
}

async function createSession(phone) {
  const { data } = await supabase
    .from("sessions")
    .upsert({ phone, state: "AWAITING_PACK", pending_order: null })
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
  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("whatsapp_phone", phone)
    .single();
  return data;
}

async function upsertCustomer(phone, { name, delivery_address }) {
  await supabase
    .from("customers")
    .upsert({ whatsapp_phone: phone, name, delivery_address });
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

  return {
    pack_size: data.pack_size,
    flavors: data.order_items.map(i => i.flavor),
  };
}

// ============================================================
// UTILS
// ============================================================

function buildSummary(selections) {
  const counts = {};
  for (const f of selections) {
    counts[f] = (counts[f] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([id, qty]) => `${FLAVORS[id].emoji} ${FLAVORS[id].title} x${qty}`)
    .join("\n");
}

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`🍗 Chef Papi backend running on port ${PORT}`);
});
