// Contact form (contact.html in each language): sends the form to /api/contact (worker/contact.js) and says what happened,
// in the page's language. No cookies, nothing stored in the browser. Without JavaScript the form does nothing and the
// page's email address is the way to write.
(function () {
  var form = document.getElementById("contact-form");
  if (!form) return;
  var lang = (document.documentElement.lang || "en").toLowerCase().slice(0, 2);
  var TEXT = {
    en: { sending: "Sending…", sent: "Thanks, your message is on its way. We usually reply within a few working days.",
      rate: "Too many messages in a short time. Please wait a minute and try again.",
      invalid: "Please check the highlighted fields.", fail: "Sorry, the message could not be sent. Please email support@geostrix.com instead." },
    es: { sending: "Enviando…", sent: "Gracias, tu mensaje está en camino. Normalmente respondemos en unos pocos días hábiles.",
      rate: "Demasiados mensajes en poco tiempo. Espera un minuto e inténtalo de nuevo.",
      invalid: "Revisa los campos marcados.", fail: "Lo sentimos, no se pudo enviar el mensaje. Escribe a support@geostrix.com." },
    pt: { sending: "Enviando…", sent: "Obrigado, sua mensagem está a caminho. Normalmente respondemos em poucos dias úteis.",
      rate: "Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.",
      invalid: "Confira os campos destacados.", fail: "Desculpe, não foi possível enviar a mensagem. Escreva para support@geostrix.com." },
    fr: { sending: "Envoi…", sent: "Merci, votre message est en route. Nous répondons généralement en quelques jours ouvrables.",
      rate: "Trop de messages en peu de temps. Attendez une minute et réessayez.",
      invalid: "Vérifiez les champs signalés.", fail: "Désolé, le message n'a pas pu être envoyé. Écrivez à support@geostrix.com." },
    ar: { sending: "جارٍ الإرسال…", sent: "شكرًا، رسالتك في الطريق. نرد عادةً خلال بضعة أيام عمل.",
      rate: "رسائل كثيرة في وقت قصير. يُرجى الانتظار دقيقة ثم المحاولة مجددًا.",
      invalid: "يُرجى التحقق من الحقول المحددة.", fail: "عذرًا، تعذّر إرسال الرسالة. يُرجى المراسلة على support@geostrix.com." }
  };
  var t = TEXT[lang] || TEXT.en;
  var status = document.getElementById("contact-status");
  var button = form.querySelector("button[type=submit]");
  var message = form.elements.message, counter = document.getElementById("contact-count");
  var opened = Date.now();

  function say(text, kind) {
    status.textContent = text;
    status.className = "contact-status" + (kind ? " " + kind : "");
  }
  function count() { if (counter) counter.textContent = message.value.length + " / " + message.maxLength; }
  message.addEventListener("input", count);
  count();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function (el) { el.removeAttribute("aria-invalid"); });
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var data = {
      name: form.elements.name.value, email: form.elements.email.value, category: form.elements.category.value,
      subject: form.elements.subject.value, message: message.value, extra: form.elements.extra.value,
      elapsed: Date.now() - opened, lang: document.documentElement.lang || "en"
    };
    button.disabled = true;
    say(t.sending);
    fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        if (res.status === 200 && res.body.ok) {
          form.reset(); count(); opened = Date.now();
          say(t.sent, "ok");
        } else if (res.status === 429) {
          say(t.rate, "error");
        } else if (res.status === 400 && form.elements[res.body.error]) {
          form.elements[res.body.error].setAttribute("aria-invalid", "true");
          form.elements[res.body.error].focus();
          say(t.invalid, "error");
        } else {
          say(t.fail, "error");
        }
      })
      .catch(function () { say(t.fail, "error"); })
      .then(function () { button.disabled = false; });
  });
})();
