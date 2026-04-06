/* =============================================
   BESION CHEMICAL — CONTACT PAGE
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const waLink = getWhatsAppLink();
  const waFloat = document.querySelector('.whatsapp-float');
  if (waFloat) waFloat.href = waLink;
  const waChannel = document.querySelector('.contact-channel[href*="wa.me/"]');
  if (waChannel) waChannel.href = waLink;

  const msgInput = document.getElementById('ctMessage');
  const wordCount = document.getElementById('wordCount');
  const maxWords = 1000;

  function updateWordCount() {
    if (!msgInput || !wordCount) return;
    const raw = msgInput.value.trim();
    const count = raw ? raw.split(/\s+/).length : 0;
    wordCount.textContent = `${count} / ${maxWords} words`;
    wordCount.classList.toggle('over', count > maxWords);
  }

  if (msgInput) {
    msgInput.addEventListener('input', updateWordCount);
    updateWordCount();
  }

  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitContactForm();
    });
  }
});

function submitContactForm() {
  const nameInput = document.getElementById('ctName');
  const emailInput = document.getElementById('ctEmail');
  const msgInput = document.getElementById('ctMessage');
  const submitBtn = document.getElementById('contactSubmitBtn');
  const sanitize = (value, max = 2000) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
  const name = sanitize(nameInput?.value, 120);
  const email = sanitize(emailInput?.value, 180);
  const msg = sanitize(msgInput?.value, 6000);
  const words = msg ? msg.split(/\s+/).length : 0;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name) { showToast('Please enter your name.', 'error'); nameInput?.focus(); return; }
  if (!email) { showToast('Please enter your email address.', 'error'); emailInput?.focus(); return; }
  if (!emailPattern.test(email)) { showToast('Please enter a valid email address.', 'error'); emailInput?.focus(); return; }
  if (!msg) { showToast('Please enter your message.', 'error'); msgInput?.focus(); return; }
  if (words > 1000) { showToast('Message exceeds 1000 words.', 'error'); msgInput?.focus(); return; }
  if (submitBtn?.disabled) return;
  if (typeof window.besionGateAction === 'function') {
    if (!window.besionGateAction(submitBtn)) return;
  }

  const recipient = 'info@besionchemical.com';
  const subject = `Contact Us - ${name}`;
  const body = [
    'New Contact Request',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    '',
    'Message:',
    msg
  ].join('\n');

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Use an <a> click to avoid popup blockers (Brave, Firefox strict mode, etc.)
  showToast('Opening your email client...', 'success');
  const link = document.createElement('a');
  link.href = gmailUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Fallback: if the browser still blocks the <a> click (rare), try mailto after a short delay
  setTimeout(() => {
    // Only trigger mailto if the page is still visible (user wasn't redirected)
    if (document.visibilityState === 'visible' || document.hasFocus()) {
      window.location.href = mailtoUrl;
    }
  }, 1500);
}
