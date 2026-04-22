-- ============================================================
-- CHEF PAPI — Supabase Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- CUSTOMERS
create table customers (
  id                bigint generated always as identity primary key,
  whatsapp_phone    text unique not null,
  name              text,
  delivery_address  text,
  created_at        timestamptz default now()
);

-- ORDERS
create table orders (
  id                bigint generated always as identity primary key,
  customer_id       bigint references customers(id),
  pack_size         int not null check (pack_size in (3, 5, 10)),
  total_price       int not null,
  status            text not null default 'pending'
                    check (status in ('pending', 'paid', 'sent', 'delivered', 'cancelled')),
  delivery_address  text,
  cardnet_ref       text,
  logistics_ref     text,
  created_at        timestamptz default now()
);

-- ORDER ITEMS
create table order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint references orders(id) on delete cascade,
  unit_number  int not null,
  flavor       text not null
               check (flavor in ('none', 'pomodoro', 'pesto', 'aglio', 'teriyaki', 'bbq'))
);

-- SESSIONS (tracks WhatsApp conversation state per customer)
create table sessions (
  phone          text primary key,
  state          text not null default 'AWAITING_PACK',
  pending_order  jsonb,
  updated_at     timestamptz default now()
);

-- FLAVORS (optional — useful to toggle availability)
create table flavors (
  id          text primary key,
  title       text not null,
  emoji       text,
  available   boolean default true
);

insert into flavors (id, title, emoji) values
  ('none',     'Sin Sabor', '🍗'),
  ('pomodoro', 'Pomodoro',  '🍅'),
  ('pesto',    'Pesto',     '🌿'),
  ('aglio',    'Aglio',     '🧄'),
  ('teriyaki', 'Teriyaki',  '🥢'),
  ('bbq',      'Barbecue',  '🔥');

-- ── USEFUL QUERIES ────────────────────────────────────────────

-- All orders this month
-- select * from orders
-- where created_at >= date_trunc('month', now())
-- order by created_at desc;

-- Revenue this month
-- select sum(total_price) as revenue
-- from orders
-- where status = 'paid'
-- and created_at >= date_trunc('month', now());

-- Most popular flavors
-- select flavor, count(*) as total
-- from order_items
-- group by flavor
-- order by total desc;

-- Customer order history
-- select c.name, c.whatsapp_phone, count(o.id) as orders, sum(o.total_price) as spent
-- from customers c
-- join orders o on o.customer_id = c.id
-- where o.status = 'paid'
-- group by c.id
-- order by spent desc;
