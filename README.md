# Пид Пад

Найзуудтайгаа цуглахад тоглох тоглоомын сайт. Нэг утсыг дамжуулж, хөзөр шагайгаа гаргаж, эсвэл дүрмийг нь хараад утасгүй тоглоно.

## Файлууд

- `app.html`: сайтын бүх код (засах бол үүнийг засна)
- `index.html`: `./build.sh` ажиллуулахад `app.html`-ээс үүснэ, Cloudflare үүнийг үзүүлнэ
- `custom.json`: бүх хүнд харагдах өөрийн тоглоом, асуулт, шийтгэлүүд

## Админ засвар

Сайтад орсон хүмүүс зөвхөн тоглоно. Засах товч зөвхөн админд харагдана.

- Нүүр хуудасны хамгийн доор **Админ** дараад (эсвэл хаягийн ард `#admin`) нууц үгээ оруулна.
- Админ засвар хийхэд Cloudflare KV-д (`pid-pad-content`) хадгалагдаж, бүх хүнд шууд харагдана.
- `functions/api/content.js` засвар уншиж/хадгална, `functions/api/login.js` нууц үг шалгана.

## Cloudflare Pages тохиргоо (нэг удаа)

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → энэ репо.
2. Project name: `pid-pad` (wrangler.toml дахь нэртэй ижил). Framework: None. Build command: хоосон. Output: `/`.
3. Төслийн **Settings → Variables and Secrets** → **Add** → Type: Secret, Name: `ADMIN_PASSWORD`, Value: өөрийн нууц үг. Хадгалаад **Deployments**-ээс дахин deploy хийнэ.
4. KV холболт (`PP`) `wrangler.toml`-д бичигдсэн тул өөр юм хийх шаардлагагүй.

## Файлууд

- `app.html`: сайтын бүх код. Засаад `./build.sh` ажиллуулж `index.html`-ийг шинэчилнэ.
- `custom.json`: сервергүй (жишээ нь Claude artifact) үед ашиглагдах нийтлэг агуулга.
