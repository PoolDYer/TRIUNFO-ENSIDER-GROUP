export const schema = `
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('ADMIN','SELLER')),
 active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_current_email_idx ON users(email) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
 key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY, code text UNIQUE NOT NULL, name text NOT NULL,
 stock integer NOT NULL CHECK(stock >= 0), sale_price bigint NOT NULL CHECK(sale_price >= 0),
 purchase_price bigint CHECK(purchase_price >= 0), active boolean NOT NULL DEFAULT true,
 min_stock integer NOT NULL DEFAULT 10 CHECK(min_stock >= 0)
);
CREATE TABLE IF NOT EXISTS sales (
 id uuid PRIMARY KEY, date date NOT NULL, detail text NOT NULL DEFAULT '',
 cash bigint NOT NULL CHECK(cash >= 0), digital bigint NOT NULL CHECK(digital >= 0),
 debt bigint NOT NULL CHECK(debt >= 0), method text NOT NULL, reference text NOT NULL DEFAULT '',
 total bigint NOT NULL CHECK(total = cash + digital + debt), user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sale_items (
 id uuid PRIMARY KEY, sale_id uuid NOT NULL REFERENCES sales(id), product_id uuid NOT NULL REFERENCES products(id),
 code text NOT NULL, name text NOT NULL, quantity integer NOT NULL CHECK(quantity > 0),
 unit_price bigint NOT NULL CHECK(unit_price >= 0), purchase_price bigint
);
CREATE TABLE IF NOT EXISTS receipts (
 id uuid PRIMARY KEY, date date NOT NULL, product_id uuid NOT NULL REFERENCES products(id),
 quantity integer NOT NULL CHECK(quantity > 0), supplier text NOT NULL, order_cost bigint NOT NULL CHECK(order_cost >= 0),
 modality text NOT NULL CHECK(modality IN ('CASH','CREDIT')), paid bigint NOT NULL CHECK(paid >= 0 AND paid <= order_cost),
 user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS expenses (
 id uuid PRIMARY KEY, date date NOT NULL, kind text NOT NULL CHECK(kind IN ('OPERATING','FIXED')),
 detail text NOT NULL, amount bigint NOT NULL CHECK(amount > 0), user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS treasury (
 id uuid PRIMARY KEY, date date NOT NULL, kind text NOT NULL CHECK(kind IN ('DEBT','DEPOSIT','DELIVERY')),
 detail text NOT NULL, amount bigint NOT NULL CHECK(amount > 0), user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bank_movements (
 id uuid PRIMARY KEY, date date NOT NULL, kind text NOT NULL CHECK(kind IN ('INCOME','WITHDRAWAL')),
 detail text NOT NULL, amount bigint NOT NULL CHECK(amount > 0), user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cash_openings (
 date date PRIMARY KEY, amount bigint NOT NULL CHECK(amount >= 0), user_id uuid NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS audit_log (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), action text NOT NULL,
 entity_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS initial_reference (
 id text PRIMARY KEY, source text NOT NULL, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS google_connection (
 id integer PRIMARY KEY CHECK(id=1), refresh_token_encrypted text NOT NULL,
 client_id text NOT NULL, connected_by uuid NOT NULL REFERENCES users(id),
 connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS google_exports (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), date date NOT NULL,
 period text NOT NULL CHECK(period IN ('day','week','month')),
 status text NOT NULL CHECK(status IN ('PENDING','READY','FAILED')),
 spreadsheet_id text, spreadsheet_url text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_exports_user_idx ON google_exports(user_id,created_at);
CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(date);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(date);
CREATE INDEX IF NOT EXISTS bank_date_idx ON bank_movements(date);
CREATE INDEX IF NOT EXISTS treasury_date_idx ON treasury(date);
CREATE INDEX IF NOT EXISTS receipts_date_idx ON receipts(date);
CREATE INDEX IF NOT EXISTS audit_date_idx ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS credit_principal bigint CHECK(credit_principal >= 0);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS interest_bps integer NOT NULL DEFAULT 0 CHECK(interest_bps BETWEEN 0 AND 10000);
-- Historical credit entries preserve their original outstanding amount without invented interest.
UPDATE receipts SET credit_principal=order_cost-paid WHERE modality='CREDIT' AND credit_principal IS NULL;
CREATE TABLE IF NOT EXISTS financing_payments (
 id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES receipts(id), date date NOT NULL,
 amount bigint NOT NULL CHECK(amount > 0), detail text NOT NULL DEFAULT '',
 user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financing_payments_receipt_idx ON financing_payments(receipt_id,date);
CREATE INDEX IF NOT EXISTS financing_payments_date_idx ON financing_payments(date);
CREATE TABLE IF NOT EXISTS receipt_items (
 receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES products(id),
 code text NOT NULL, name text NOT NULL,
 quantity integer NOT NULL CHECK(quantity > 0),
 unit_purchase_price bigint NOT NULL CHECK(unit_purchase_price >= 0),
 PRIMARY KEY(receipt_id,product_id)
);
CREATE INDEX IF NOT EXISTS receipt_items_product_idx ON receipt_items(product_id);
CREATE TABLE IF NOT EXISTS sale_losses (
 sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES products(id),
 code text NOT NULL, name text NOT NULL, quantity integer NOT NULL CHECK(quantity > 0),
 unit_price bigint NOT NULL CHECK(unit_price >= 0), purchase_price bigint CHECK(purchase_price >= 0),
 PRIMARY KEY(sale_id,product_id)
);
CREATE INDEX IF NOT EXISTS sale_losses_product_idx ON sale_losses(product_id);
CREATE TABLE IF NOT EXISTS stock_notifications (
 id uuid PRIMARY KEY, product_id uuid REFERENCES products(id) ON DELETE SET NULL,
 code text NOT NULL, name text NOT NULL, stock integer NOT NULL,
 min_stock integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz, read_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_notifications_active_idx ON stock_notifications(product_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS stock_notifications_created_idx ON stock_notifications(created_at DESC);
`;
