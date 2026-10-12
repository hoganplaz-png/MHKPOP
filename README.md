# mh.kpop.sell.com shop website

Information website for MH KPOP SELL (@mh.kpop.sell). Customers read the price list, **create an account**, and order **only through the order form**.
You run everything from the admin page, with no coding.

Live site: https://mhkpop-4cf2f.web.app  ·  Admin page: https://mhkpop-4cf2f.web.app/admin

## The admin page (/admin)
Sign in with the admin email and the password you set in Firebase Authentication.

| Tab | What you can do |
|---|---|
| **訂單** (Orders) | See every order, search, filter by status, change status (新訂單, 已確認, 已完成, 已取消), export CSV |
| **商品** (Products) | Add, edit and delete albums. Change price, tag and photo. Choose how each album can be bought: **格仔舖現貨** (in stock at the store), **訂購** (pre-order, with an optional arrival date) and/or **可寄順豐** (can be sent by SF Express). Mark 售罄 (sold out) or 隱藏 (hide). Move items up or down. Changes show on the website straight away. Each product also has:<br>**存庫** (stock): one number per product. Every sale takes 1 off it (收銀, a pasted POS record, or a confirmed website order), and cancelling or deleting a sale puts it back. At 0 the website shows 售罄 by itself. Leave it empty to not track a product. You can also type the stock straight in the product list.<br>**POS 別名**: other names One POS uses for the product. Names you pick by hand when pasting a POS record are remembered automatically.<br>**加購優惠** (add-on): pick another product (it can be hidden) and set a special price, e.g. a photocard for HK$10 when buying this album. Customers see it on the order form after choosing the album (at most one add-on per album), and 收銀 shows an add-on button |
| **付款方式** (Payment methods) | Choose what customers see on the payment page: QR codes (PayMe, Alipay, WeChat Pay HK...), text details (FPS number, bank account, with a copy button) or a payment link (PayPal.me, Stripe Payment Link). Turn methods on or off, reorder them |
| **網站內容** (Website text) | Headline, intro, opening hours, address, stall name, enquiry note, Instagram name, and a switch to **open or close online ordering** |
| **全部文字** (Every word) | Every other sentence on the website: menu, buttons, steps, FAQ, order-form messages, the payment page, the **Terms of Service** and the **Privacy Policy**. Each item shows the current wording. Edit it and press 儲存全部修改; press 還原 to go back to the original |

Photos are shrunk automatically in your browser and saved with the product.
The names of the delivery choices (順豐到付, 門市自取) can be changed in the **全部文字** tab. Which products can use which choice follows the product settings: 順豐 needs every chosen album to be 可寄順豐; 門市自取 needs every chosen album to be 格仔舖現貨 or 訂購.

## Shop management (admin page, second row of tabs)
| Tab | What it does |
|---|---|
| **收銀** (POS) | Tap albums to build a sale, edit the price, give a discount, pick the payment method, press 完成銷售. Stock goes down automatically and the sale is saved with the cost of the albums sold |
| **銷售紀錄** (Sales) | Paste the sales record from One POS and press 辨識: it finds the date, receipt number, items, quantity, price and payment method, splits it into sales, matches the items to your stock, and lets you check and correct before saving. Pasting the same record again never doubles it. Also lists website orders that are confirmed but not yet counted as sales |
| **進貨及成本** (Purchases and costs) | One card per bulk order: albums, quantity, price paid, selling price, plus shipping and other fees in any currency (with exchange rate). Shipping is spread over the albums (equally, or by value) to give the **cost per album**. Edit anything, any time: costs, profit and margins update everywhere. Selling price and stock left can be edited right in the table |
| **租金及開支** (Rent and costs) | Monthly rent and any other cost (one-off, monthly or yearly). Rent is spread by day, so any period gets the right share |
| **會員** (Members) | Every registered account is a member. Set how many points an order earns (default: HK$10 = 1 point) and the tiers (一般 / 銀卡 / 金卡 by total spending, with a points multiplier). Points are added automatically when you set an order to 已確認 (once only; cancelling takes them back). 調整／紀錄 lets you add or deduct points by hand (for example when a customer redeems points) with a reason, and keeps a history |
| **利潤** (Profit) | Today, yesterday, this week, this month, last month, this year, all time, or your own dates: revenue, cost of goods, gross profit, rent and costs, net profit, profit per album and per day. CSV export |

Profit uses the *current* cost of each batch, so correcting a shipping fee or price in 進貨及成本 corrects the profit of the albums already sold. Sales that cannot be matched to a purchase are flagged and left out of the cost until you fix them.
The shop-management data (`purchases`, `sales`, `expenses`) can only be read or changed by the admin email.

## Order progress, membership page
Each order card on the **訂單** tab has 訂單進度 (已收到訂單 → 已確認收款 → 訂購中／備貨中 → 貨品已到 → 已寄出 or 可到門市取貨 → 已完成), an SF tracking number and a note for the customer. Customers see this on **我的會員及訂單** (`/me`): their tier, points, spending, every order with a timeline (pre-order orders show the ordering and arrived steps), the tracking number and the note. Setting an order to 已確認 also records the sale (stock goes down) and adds the member's points.

## How ordering and payment work
0. The customer creates an account (email and password; a verification email is sent) or signs in. The order form is only shown to signed-in customers. Accounts are managed in Firebase console, Authentication, where you can also disable or delete one.
1. The customer fills in the order form, ticks the box to agree to the Terms and Privacy Policy, and taps **核對訂單**.
2. A review box shows the items, total, contact, delivery and address. **返回修改** goes back, **確認訂單，前往付款** saves the order and opens the payment page (`/pay`).
3. The payment page shows the order number, the amount and the payment methods set up on the admin page (PayMe and Alipay are included at the start).
4. The customer can upload a payment screenshot on the payment page. It is saved for you only and shows inside the order on the admin page (filter: 有付款截圖).
5. The order appears in the admin page as 新訂單. Check the amount and the order number in your PayMe or Alipay app, then change it to 已確認.

Personal PayMe and Alipay QR codes cannot be checked automatically. Automatic confirmation needs a business account with an API (PayMe for Business, Alipay merchant, or Stripe) and a small server, so it is a separate project.

For link methods, `{amount}` and `{order}` in the link are filled in automatically, for example `https://paypal.me/yourname/{amount}HKD`.

## Security rules (Firestore)
`firestore.rules` is the source. The rules are published **by hand** in Firebase console, under **Firestore Database → 規則 (Rules) → 發布 (Publish)**, because the deploy account is not allowed to publish them. After the first paste, paste again only when `firestore.rules` changes. Replace `__ADMIN_EMAIL__` with the email in `admin-email.txt` before pasting.

- A signed-in customer can add an order under their own account, and read only their own orders. The order number is the document name, so an order can never be overwritten. Only the admin email can read all orders or change their status. Nobody can delete orders.
- Anyone can read products, payment methods and website text. Only the admin email can change them.
- Only the customer who placed an order can upload a payment screenshot for it. Only the admin email can see or delete screenshots.
- Only the admin email can change the wording of the website (`settings/texts`).

## Security
- `firebase.json` sends strict security headers on every page: Content-Security-Policy (only this site and Google Firebase scripts, fonts and connections), HSTS, no framing (clickjacking), no MIME sniffing, a tight Referrer-Policy and Permissions-Policy.
- Customer text is always escaped before it is shown, so a customer cannot inject code into your admin page.
- The admin page only works for the admin email; other accounts see a "no permission" message and no data.
- Not covered: the total of an order is calculated in the browser. The admin page warns when an order total does not match its items. Firebase **App Check** (reCAPTCHA) can be added later against automated spam.

## Terms and privacy
`terms.html` (服務條款) and `privacy.html` (私隱政策, also the Personal Information Collection Statement under the Hong Kong PDPO) are linked in the footer, at sign-up and at the order form. They are templates written for a small Hong Kong online shop. Read them, change anything that does not match how you really run the shop (in the **全部文字** tab), and consider having a lawyer check them.

## Deploy
Every change pushed to `main` is deployed to Firebase Hosting by GitHub Actions (`.github/workflows/deploy.yml`).
It needs one GitHub secret, `FIREBASE_SERVICE_ACCOUNT`: the whole Firebase service-account key `.json` file.
Create it in Firebase console, Project settings, Service accounts, Generate new private key. Never share the file.
The deploy creates the web app settings (`firebase-config.js`) by itself.

## Files
- `index.html`, `styles.css`, `script.js`: the public website
- `account.js`: customer sign-up and sign-in. `fb.js`: loads Firebase. `texts.js`: the editable-wording system
- `pay.html`, `pay.js`, `pay.css`: the payment page
- `terms.html`, `privacy.html`, `legal.css`, `legal.js`: Terms of Service and Privacy Policy
- `members.js`: the 會員 tab. `me.html`, `me.js`, `me.css`: the customer's membership and order page
- `shop.js`, `shoplib.js`: the shop-management pages and their calculations (costs, stock, profit, POS-text reader)
- `admin.html`, `admin.js`, `admin.css`: the admin page
- `settings.js`: fallback shop details and delivery choices (used until you save text on the admin page)
- `firestore.rules`, `firebase.json`, `rules-manual.txt`, `admin-email.txt`: Firebase setup
- `scripts/`, `.github/`: automatic deploy
- `assets/`: logo files and the PayMe and Alipay QR codes
