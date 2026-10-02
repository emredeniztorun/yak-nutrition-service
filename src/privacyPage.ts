/**
 * Public privacy policy for the YAK app, served at GET /privacy.
 * Describes only what the app and this server actually do.
 */
export const PRIVACY_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YAK – Gizlilik Politikası / Privacy Policy</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; line-height: 1.6; color: #1d1b19; background: #fff; }
  h1 { font-size: 1.6rem; margin-bottom: 0.2rem; }
  h2 { font-size: 1.15rem; margin-top: 1.8rem; }
  .muted { color: #6b6460; font-size: 0.9rem; }
  hr { margin: 2.5rem 0; border: none; border-top: 1px solid #ddd; }
  a { color: #d8492e; }
</style>
</head>
<body>
<h1>YAK – Gizlilik Politikası</h1>
<p class="muted">Yürürlük tarihi: 2 Ekim 2026 · <a href="#en">English version below</a></p>

<p>Bu politika, YAK mobil uygulamasının ("YAK") hangi verileri işlediğini açıklar. YAK hesap oluşturmaz; reklam, analiz veya izleme araçları kullanmaz.</p>

<h2>1. Cihazınızda saklanan veriler</h2>
<p>Aşağıdaki bilgiler yalnızca telefonunuzda, uygulamanın yerel depolama alanında saklanır ve bizim sunucularımıza gönderilmez:</p>
<ul>
  <li>Profil bilgileri: adınız, yaşınız, boyunuz, kilonuz, cinsiyetiniz ve aktivite seviyeniz,</li>
  <li>Hedefleriniz (hedef türü, günlük kalori ve makro hedefleri),</li>
  <li>Kaydettiğiniz öğünler ve besinler (geçmiş ve planlanan günler dahil).</li>
</ul>
<p>Uygulama, veri güncellemelerinden önce bu verilerin yedeğini yine yalnızca cihazınızda oluşturabilir.</p>

<h2>2. Besin araması sırasında gönderilen veriler</h2>
<p>Besin değerlerini otomatik hesaplamak için bir besin aradığınızda, uygulama YAK besin sunucusuna (<code>yak-nutrition-service.onrender.com</code>) şifreli bağlantı (HTTPS) üzerinden yalnızca şunları gönderir:</p>
<ul>
  <li>yazdığınız besin adı,</li>
  <li>miktar ve birim (ör. 100 gram, 1 porsiyon).</li>
</ul>
<p>Bu istekte profil bilgileriniz, hedefleriniz veya öğün geçmişiniz bulunmaz. Değerleri kendiniz girdiğiniz (manuel) kayıtlar sunucuya hiç gönderilmez.</p>
<p>Besin YAK'ın kendi besin listesinde yoksa, sunucu yalnızca besin adını kullanarak ABD Tarım Bakanlığı'nın <strong>USDA FoodData Central</strong> veritabanını sorgulayabilir. Bu sorguyu sunucu yapar; USDA'ya erişim anahtarı yalnızca sunucuda tutulur ve uygulamaya hiçbir zaman gönderilmez.</p>

<h2>3. Sunucu tarafında işlenen teknik bilgiler</h2>
<ul>
  <li>Sunucu, besin isteklerini bir veritabanına kaydetmez.</li>
  <li>Kötüye kullanımı önlemek için (istek sınırlaması) bağlantının IP adresi sunucu belleğinde en fazla yaklaşık 1 dakika tutulur.</li>
  <li>Sunucu, Render (render.com) bulut barındırma hizmetinde çalışır. Barındırma sağlayıcısı, hizmetin işletilmesi için IP adresi ve istek zamanı gibi standart teknik kayıtları kendi politikalarına göre tutabilir.</li>
</ul>

<h2>4. Paylaşım</h2>
<p>Kişisel verilerinizi satmayız, kiralamayız ve reklam amacıyla paylaşmayız. Yukarıda açıklanan besin sorgusu dışında hiçbir veri üçüncü taraflara gönderilmez.</p>

<h2>5. Verilerinizi silme</h2>
<p>Tüm YAK verileri cihazınızda olduğundan, uygulamayı kaldırarak veya Android ayarlarından uygulama verilerini temizleyerek tamamını silebilirsiniz. Sunucuda size ait saklanan bir kayıt bulunmaz.</p>

<h2>6. Sağlık bilgisi notu</h2>
<p>YAK genel bilgilendirme amaçlıdır ve tıbbi tavsiye yerine geçmez.</p>

<h2>7. Değişiklikler</h2>
<p>Bu politika güncellenirse yeni sürüm bu sayfada, yürürlük tarihiyle birlikte yayımlanır.</p>

<h2>8. İletişim</h2>
<p>Sorularınız için: <a href="mailto:yak.support@gmail.com">yak.support@gmail.com</a></p>

<hr>

<h1 id="en">YAK – Privacy Policy</h1>
<p class="muted">Effective date: 2 October 2026</p>

<p>This policy explains what data the YAK mobile app ("YAK") processes. YAK has no user accounts and uses no advertising, analytics or tracking tools.</p>

<h2>1. Data stored on your device</h2>
<p>The following is stored only on your phone, in the app's local storage, and is not sent to our servers: your profile (name, age, height, weight, gender, activity level), your goals (goal type, daily calorie and macro targets), and the meals and foods you log (including past and planned days). Before data updates, the app may create a backup of this data, also only on your device.</p>

<h2>2. Data sent when you search for a food</h2>
<p>To calculate nutrition values automatically, the app sends only the following to the YAK nutrition server (<code>yak-nutrition-service.onrender.com</code>) over an encrypted connection (HTTPS): the food name you typed, and the amount and unit (e.g. 100 grams, 1 portion). The request contains no profile information, goals or meal history. Entries where you type the values yourself (manual entries) are never sent.</p>
<p>If the food is not in YAK's own food list, the server may query the U.S. Department of Agriculture's <strong>USDA FoodData Central</strong> database using only the food name. This query is made by the server; the USDA access key is kept only on the server and is never sent to the app.</p>

<h2>3. Technical information processed by the server</h2>
<ul>
  <li>The server does not store food requests in a database.</li>
  <li>To prevent abuse (rate limiting), the connection's IP address is kept in server memory for about 1 minute at most.</li>
  <li>The server runs on the Render (render.com) cloud hosting service, which may keep standard technical logs such as IP address and request time under its own policies.</li>
</ul>

<h2>4. Sharing</h2>
<p>We do not sell, rent or share your personal data for advertising. Apart from the food lookup described above, no data is sent to third parties.</p>

<h2>5. Deleting your data</h2>
<p>All YAK data is on your device, so you can delete all of it by uninstalling the app or clearing its data in Android settings. No records about you are stored on the server.</p>

<h2>6. Health note</h2>
<p>YAK is for general information only and is not medical advice.</p>

<h2>7. Changes</h2>
<p>If this policy is updated, the new version will be published on this page with its effective date.</p>

<h2>8. Contact</h2>
<p>Questions: <a href="mailto:yak.support@gmail.com">yak.support@gmail.com</a></p>
</body>
</html>
`;
