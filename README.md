# MHKPOP shop website

Information website for MH KPOP SELL (@mh.kpop.sell). Customers read the price list and order **only through the order form**.
You run everything from the admin page, with no coding.

Live site: https://mhkpop-4cf2f.web.app  ·  Admin page: https://mhkpop-4cf2f.web.app/admin

## The admin page (/admin)
Sign in with the admin email and the password you set in Firebase Authentication.

| Tab | What you can do |
|---|---|
| **訂單** (Orders) | See every order, search, filter by status, change status (新訂單, 已確認, 已完成, 已取消), export CSV |
| **商品** (Products) | Add, edit and delete albums. Change price, tag and photo. Mark 售罄 (sold out), 只限門市 (in-store only) or 隱藏 (hide). Move items up or down. Changes show on the website straight away |
| **付款方式** (Payment methods) | Choose what customers see on the payment page: QR codes (PayMe, Alipay, WeChat Pay HK...), text details (FPS number, bank account, with a copy button) or a payment link (PayPal.me, Stripe Payment Link). Turn methods on or off, reorder them |
| **網站內容** (Website text) | Headline, intro, opening hours, address, stall name, enquiry note, Instagram name, and a switch to **open or close online ordering** |

Photos are shrunk automatically in your browser and saved with the product.
The delivery choices (順豐到付, 門市自取) are in `settings.js`.

## How ordering and payment work
1. The customer fills in the order form and taps **核對訂單**.
2. A review box shows the items, total, contact, delivery and address. **返回修改** goes back, **確認訂單，前往付款** saves the order and opens the payment page (`/pay`).
3. The payment page shows the order number, the amount and the payment methods set up on the admin page (PayMe and Alipay are included at the start).
4. The customer can upload a payment screenshot on the payment page. It is saved for you only and shows inside the order on the admin page (filter: 有付款截圖).
5. The order appears in the admin page as 新訂單. Check the amount and the order number in your PayMe or Alipay app, then change it to 已確認.

Personal PayMe and Alipay QR codes cannot be checked automatically. Automatic confirmation needs a business account with an API (PayMe for Business, Alipay merchant, or Stripe) and a small server, so it is a separate project.

For link methods, `{amount}` and `{order}` in the link are filled in automatically, for example `https://paypal.me/yourname/{amount}HKD`.

## Security rules (Firestore)
`firestore.rules` is the source. The rules are published **by hand** in Firebase console, under **Firestore Database → 規則 (Rules) → 發布 (Publish)**, because the deploy account is not allowed to publish them. After the first paste, paste again only when `firestore.rules` changes. Replace `__ADMIN_EMAIL__` with the email in `admin-email.txt` before pasting.

- Anyone can add a valid order. Only the admin email can read orders or change their status. Nobody can delete orders.
- Anyone can read products, payment methods and website text. Only the admin email can change them.
- Anyone can upload a payment screenshot for an order. Only the admin email can see or delete screenshots.

## Deploy
Every change pushed to `main` is deployed to Firebase Hosting by GitHub Actions (`.github/workflows/deploy.yml`).
It needs one GitHub secret, `FIREBASE_SERVICE_ACCOUNT`: the whole Firebase service-account key `.json` file.
Create it in Firebase console, Project settings, Service accounts, Generate new private key. Never share the file.
The deploy creates the web app settings (`firebase-config.js`) by itself.

## Files
- `index.html`, `styles.css`, `script.js`: the public website
- `pay.html`, `pay.js`, `pay.css`: the payment page
- `admin.html`, `admin.js`, `admin.css`: the admin page
- `settings.js`: fallback shop details and delivery choices (used until you save text on the admin page)
- `firestore.rules`, `firebase.json`, `rules-manual.txt`, `admin-email.txt`: Firebase setup
- `scripts/`, `.github/`: automatic deploy
- `assets/`: logo files and the PayMe and Alipay QR codes
