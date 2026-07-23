(function () {
  var forms = document.querySelectorAll("[data-newsletter-form]");

  forms.forEach(function (form) {
    var startedAtInput = form.querySelector("[data-form-started-at]");
    var message = form.querySelector("[data-form-message]");
    var button = form.querySelector("button[type='submit']");

    if (startedAtInput) {
      startedAtInput.value = String(Date.now());
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!message || !button) {
        return;
      }

      var formData = new FormData(form);
      var email = String(formData.get("email") || "").trim();
      var firstName = String(formData.get("firstName") || "").trim();
      var consent = formData.get("consent") === "on";
      var honeypot = String(formData.get("website") || "").trim();
      var formStartedAt = String(formData.get("formStartedAt") || "");

      message.className = "form-message";

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        message.textContent = "Please enter a valid email address.";
        message.classList.add("is-error");
        return;
      }

      if (!consent) {
        message.textContent = "Please confirm that you want to receive the newsletter.";
        message.classList.add("is-error");
        return;
      }

      button.disabled = true;
      message.textContent = "Joining...";

      fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email,
          firstName: firstName,
          consent: consent,
          website: honeypot,
          formStartedAt: formStartedAt
        })
      })
        .then(function (response) {
          return response.json().catch(function () {
            return {};
          }).then(function (payload) {
            if (!response.ok) {
              throw new Error(payload.error || "Subscription failed.");
            }
            return payload;
          });
        })
        .then(function (payload) {
          message.textContent = payload.message || "You're on the list. Please check your inbox if confirmation is required.";
          message.classList.add("is-success");
          form.reset();
          if (startedAtInput) {
            startedAtInput.value = String(Date.now());
          }
        })
        .catch(function (error) {
          message.textContent = error.message || "Something went wrong. Please try again.";
          message.classList.add("is-error");
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  });
}());
