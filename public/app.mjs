const $ = (id) => document.getElementById(id);

const ui = Object.fromEntries([
  'desk', 'presetSelect', 'presetDescription', 'reviewButton', 'reviewButtonText',
  'liveNote', 'serviceDot', 'serviceLabel', 'actionMessage', 'paymentStage',
  'decisionTag', 'stageContext', 'staleIndicator', 'ourPartyName', 'otherPartyName',
  'moneyPath', 'paymentPrice', 'paymentLabel', 'paymentSentence', 'replyPath',
  'replyPaymentSentence', 'stageSummary', 'threadFields', 'ourSideInput',
  'counterpartyInput', 'messages', 'messageCount', 'addMessageButton', 'messageLimit',
  'copyButton', 'copyButtonText', 'copyNote', 'replyNote', 'replyTitle', 'replyDetail',
  'termsList', 'termPayment', 'termPrice', 'termScope', 'evidenceCount', 'evidenceList',
  'sourcePanel', 'sourceHeading', 'sourceText', 'sourceHint', 'clearHighlightButton',
  'nativeDisclosure', 'endpointList', 'rawData', 'announcement',
].map((id) => [id, $(id)]));

const state = {
  presets: [],
  input: {
    ourSide: 'Your studio', counterparty: 'Their business',
    messages: [{ author: 'Your studio', text: '' }, { author: 'Their business', text: '' }],
  },
  reviewedInput: null,
  review: null,
  recorded: true,
  stale: false,
  live: false,
  busy: false,
  selectedEvidence: null,
};

const kinds = {
  agreed: {
    tag: 'Terms agreed',
    title: 'The reply accepts the offer.',
    detail: 'The payment direction, price, and scope are supported by the thread.',
    summary: 'The reply accepts the proposed payment and work. The quoted terms are ready to record.',
  },
  clarify: {
    tag: 'Clarification requested',
    title: 'The reply asks for more information.',
    detail: 'Answer the open questions, then ask for a clear acceptance of the payment and work.',
    summary: 'The offer sets a payment direction. The reply asks for information before deciding.',
  },
  declined: {
    tag: 'Offer declined',
    title: 'The reply declines the offer.',
    detail: 'The original payment and work remain a proposal. Read the reply’s exact words below.',
    summary: 'The original payment direction is a proposal. The reply declines the offer.',
  },
  conflict: {
    tag: 'Payment directions differ',
    title: 'The reply describes a different deal.',
    detail: 'The offer and reply put payment on opposite sides. Clarify who pays whom before recording terms.',
    summary: 'The solid arrow follows the offer. The dashed arrow follows the reply’s payment understanding.',
  },
  incomplete: {
    tag: 'Key terms missing',
    title: 'This thread needs a complete offer.',
    detail: 'Add the missing source-backed terms, then review the thread again.',
    summary: 'A payment direction can be reviewed while the quoted offer still needs a required term.',
  },
};

const endpointExplanations = {
  decide: 'Decide reads intent and payment roles',
  extract: 'Extract locates the quoted evidence',
  fill: 'Fill structures the supported terms',
};

const clone = (value) => structuredClone(value);
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const sentenceCase = (value) => {
  const words = String(value ?? '').replaceAll('_', ' ').trim();
  if (!words) return 'Source passage';
  return words[0].toUpperCase() + words.slice(1);
};

function announce(message) {
  ui.announcement.textContent = message;
}

function showMessage(message, tone = 'info') {
  ui.actionMessage.textContent = message;
  ui.actionMessage.dataset.tone = tone;
  ui.actionMessage.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  ui.actionMessage.hidden = !message;
}

function canCopy() {
  return Boolean(state.review && !state.stale && !state.busy &&
    state.review.kind === 'agreed' && state.review.complete === true && state.review.accepted === true);
}

function syncControls() {
  ui.reviewButton.disabled = !state.live || state.busy;
  ui.threadFields.disabled = state.busy;
  ui.presetSelect.disabled = state.busy || state.presets.length === 0;
  ui.copyButton.disabled = !canCopy();
  ui.addMessageButton.disabled = state.input.messages.length >= 8;
  ui.reviewButtonText.textContent = state.busy ? 'Reviewing thread…' : 'Review thread';
  ui.reviewButton.querySelector('.button-spinner').hidden = !state.busy;
  ui.reviewButton.querySelector('.review-icon').hidden = state.busy;
  ui.reviewButton.setAttribute('aria-busy', String(state.busy));
  ui.messageCount.textContent = `${state.input.messages.length} messages`;
  ui.messageLimit.textContent = state.input.messages.length >= 8 ? '8-message limit reached' : 'Up to 8 messages';
  ui.desk.classList.toggle('is-stale', state.stale);
  ui.staleIndicator.hidden = !state.stale;
  ui.sourceHeading.textContent = state.stale ? 'Exact source from last review' : 'Exact source';
  if (state.stale) {
    ui.stageContext.textContent = 'Last review, before your edits';
    ui.copyNote.textContent = 'Review your edits to refresh the terms before copying.';
  } else if (canCopy()) {
    ui.copyNote.textContent = 'Copy a terms note with the quoted source.';
  } else if (state.review?.kind === 'incomplete') {
    ui.copyNote.textContent = 'Complete the missing terms and review again to enable copying.';
  } else {
    ui.copyNote.textContent = 'Copy is available when the reply accepts complete terms.';
  }
}

function markEdited() {
  state.stale = Boolean(state.review);
  ui.copyButtonText.textContent = 'Copy terms';
  showMessage('');
  syncControls();
}

function partyOptions(select, author) {
  select.replaceChildren();
  const parties = [state.input.ourSide, state.input.counterparty];
  for (const [index, party] of parties.entries()) {
    const option = document.createElement('option');
    option.value = party;
    option.textContent = party || (index === 0 ? 'Our side' : 'Counterparty');
    select.append(option);
  }
  select.value = parties.includes(author) ? author : parties[0];
}

function renderMessages() {
  ui.messages.replaceChildren();
  state.input.messages.forEach((message, index) => {
    const article = document.createElement('article');
    article.className = 'message';
    const top = document.createElement('div');
    top.className = 'message-top';
    const step = document.createElement('span');
    step.className = 'message-step';
    step.textContent = index === 0 ? 'Offer' : `Reply ${index}`;
    const select = document.createElement('select');
    select.className = 'author-select';
    select.setAttribute('aria-label', index === 0 ? 'Offer author' : `Reply ${index} author`);
    partyOptions(select, message.author);
    select.addEventListener('change', () => {
      state.input.messages[index].author = select.value;
      markEdited();
    });
    top.append(step, select);
    if (index > 0 && state.input.messages.length > 2) {
      const remove = document.createElement('button');
      remove.className = 'remove-message';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove reply ${index}`);
      remove.innerHTML = '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 5L13 13M13 5L5 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      remove.addEventListener('click', () => {
        state.input.messages.splice(index, 1);
        markEdited();
        renderMessages();
        const nearby = ui.messages.children[Math.min(index, state.input.messages.length - 1)];
        nearby?.querySelector('textarea')?.focus();
        announce('Reply removed. Review the edited thread to refresh its terms.');
      });
      top.append(remove);
    }
    const text = document.createElement('textarea');
    text.className = 'message-input';
    text.rows = Math.min(10, Math.max(4, Math.ceil(message.text.length / 74)));
    text.maxLength = 4000;
    text.value = message.text;
    text.placeholder = index === 0 ? 'Paste the original offer, including price and work…' : 'Paste the reply in its own words…';
    text.setAttribute('aria-label', index === 0 ? 'Original offer message' : `Reply ${index} message`);
    text.addEventListener('input', () => {
      state.input.messages[index].text = text.value;
      markEdited();
    });
    article.append(top, text);
    ui.messages.append(article);
  });
  syncControls();
}

function renameParty(key, value) {
  const previous = state.input[key];
  state.input[key] = value;
  for (const message of state.input.messages) {
    if (message.author === previous) message.author = value;
  }
  for (const [index, select] of [...ui.messages.querySelectorAll('select')].entries()) {
    partyOptions(select, state.input.messages[index].author);
  }
  markEdited();
}

function directionFor(payer, payee, input = state.reviewedInput) {
  if (!input || !hasText(payer) || !hasText(payee)) return 'unknown';
  if (payer === input.counterparty && payee === input.ourSide) return 'left';
  if (payer === input.ourSide && payee === input.counterparty) return 'right';
  return 'unknown';
}

function missingTerms(review) {
  const missing = [];
  if (!hasText(review.payer) || !hasText(review.payee)) missing.push('payment roles');
  if (!hasText(review.price)) missing.push('price');
  if (!hasText(review.scope)) missing.push('work');
  return missing;
}

function renderReview() {
  const review = state.review;
  const input = state.reviewedInput;
  state.selectedEvidence = null;
  ui.clearHighlightButton.hidden = true;
  if (!review || !input) {
    syncControls();
    return;
  }
  const kind = kinds[review.kind] ? review.kind : 'incomplete';
  const words = kinds[kind];
  const directionDisagrees = hasText(review.payer) && hasText(review.replyPayer) && review.payer !== review.replyPayer;
  ui.paymentStage.dataset.kind = kind;
  ui.replyNote.dataset.kind = kind;
  ui.decisionTag.textContent = words.tag;
  ui.stageContext.textContent = state.recorded ? 'Recorded native review' : 'Reviewed by Clocked';
  ui.ourPartyName.textContent = input.ourSide;
  ui.otherPartyName.textContent = input.counterparty;
  ui.paymentPrice.textContent = hasText(review.price) ? review.price : 'Price missing';
  ui.paymentPrice.classList.toggle('is-missing', !hasText(review.price));
  ui.paymentLabel.textContent = kind === 'agreed' ? 'Agreed payment' : 'Proposed payment';
  ui.moneyPath.dataset.direction = directionFor(review.payer, review.payee);
  ui.paymentSentence.textContent = hasText(review.payer) && hasText(review.payee)
    ? `${review.payer} pays ${review.payee}${hasText(review.price) ? ` ${review.price}` : ', with the price still missing'}.`
    : 'The payment roles need source-backed terms.';
  const replyPayee = review.replyPayer === input.ourSide ? input.counterparty : input.ourSide;
  const replyDirection = directionFor(review.replyPayer, replyPayee);
  const reversed = hasText(review.replyPayer) && replyDirection !== 'unknown' && replyDirection !== ui.moneyPath.dataset.direction;
  ui.replyPath.hidden = !reversed;
  ui.replyPath.dataset.direction = replyDirection;
  ui.replyPaymentSentence.textContent = reversed ? `The reply understands that ${review.replyPayer} pays ${replyPayee}.` : '';
  ui.stageSummary.textContent = words.summary;
  ui.replyTitle.textContent = words.title;
  ui.replyDetail.textContent = words.detail;
  if (kind === 'conflict' && !directionDisagrees) {
    ui.decisionTag.textContent = 'Counteroffer received';
    ui.replyTitle.textContent = 'The reply proposes different terms.';
    ui.replyDetail.textContent = 'Review the changed price or work and ask both parties to accept the same terms.';
    ui.stageSummary.textContent = 'The arrow follows the original offer. The reply proposes a change to its terms.';
  } else if (kind === 'conflict' && review.status === 'declined') {
    ui.replyTitle.textContent = 'The reply declines a different deal.';
    ui.replyDetail.textContent = 'The reply declines the offer while reversing who pays whom. Clarify the payment direction before discussing acceptance.';
  } else if (kind === 'conflict' && review.status === 'counteroffer') {
    ui.replyTitle.textContent = 'The reply reverses the proposed payment.';
    ui.replyDetail.textContent = 'This is a counteroffer with the payer on the other side. Resolve the direction before recording agreed terms.';
  } else if (kind === 'incomplete') {
    const missing = missingTerms(review);
    if (missing.length) {
      ui.replyTitle.textContent = `The ${missing.join(' and ')} ${missing.length > 1 ? 'need' : 'needs'} a quoted term.`;
      ui.replyDetail.textContent = 'Add the missing term to the original offer, then ask the other party to accept the complete terms.';
      ui.stageSummary.textContent = `The thread is missing source-backed ${missing.join(' and ')}. Complete the offer before recording an agreement.`;
    } else {
      ui.replyDetail.textContent = 'A required term lacks a valid source reference. Edit the original offer so payment, price, and work are explicit, then review again.';
    }
  }
  setTerm(ui.termPayment, hasText(review.payer) && hasText(review.payee) ? `${review.payer} pays ${review.payee}` : null, 'Payment roles missing from the source');
  setTerm(ui.termPrice, review.price, 'Price missing from the source');
  setTerm(ui.termScope, review.scope, 'Work missing from the source');
  addTermSources(ui.termPayment, ['payer', 'payee']);
  addTermSources(ui.termPrice, ['price']);
  addTermSources(ui.termScope, ['scope']);
  renderEvidence();
  renderSource();
  renderNativeData();
  ui.copyButtonText.textContent = 'Copy terms';
  syncControls();
}

function setTerm(element, value, missing) {
  element.textContent = hasText(value) ? value : missing;
  element.classList.toggle('is-missing', !hasText(value));
}

function addTermSources(element, ids) {
  const evidence = state.review?.evidence || [];
  const links = document.createElement('span');
  links.className = 'term-sources';
  for (const id of ids) {
    const index = evidence.findIndex((item) => item?.id === id && sourceRange(item));
    if (index < 0) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'term-source';
    button.dataset.evidenceIndex = String(index);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = ids.length > 1 ? sentenceCase(id) : 'Source';
    button.setAttribute('aria-label', `Show ${id === 'scope' ? 'work' : id} in the exact source`);
    button.setAttribute('aria-controls', 'sourceText');
    button.addEventListener('click', () => selectEvidence(index));
    links.append(button);
  }
  if (links.childElementCount) element.append(links);
}

function sourceRange(evidence) {
  const points = Array.from(state.review?.source ?? '');
  const { start, end, value } = evidence;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > points.length) return null;
  if (points.slice(start, end).join('') !== value) return null;
  return { points, start, end };
}

function renderEvidence() {
  const evidence = Array.isArray(state.review?.evidence) ? state.review.evidence : [];
  const termIds = ['payer', 'payee', 'price', 'scope'];
  const passages = evidence.filter((item) => !termIds.includes(item?.id));
  ui.evidenceList.replaceChildren();
  const quoted = passages.filter((item) => item && hasText(item.value));
  ui.evidenceCount.textContent = quoted.length ? `${quoted.length} ${quoted.length === 1 ? 'passage' : 'passages'}` : '';
  if (evidence.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-evidence';
    empty.textContent = 'No source quotations were returned for this review.';
    ui.evidenceList.append(empty);
    return;
  }
  evidence.forEach((item, index) => {
    // Fill's short field spans are available beside the terms above. Keep this
    // reading list for Extract's contextual offer and reply quotations.
    if (termIds.includes(item?.id)) return;
    const label = sentenceCase(item?.label || item?.id || 'Source passage');
    if (!item || !hasText(item.value)) {
      const missing = document.createElement('div');
      missing.className = 'missing-evidence';
      const heading = document.createElement('span');
      heading.className = 'claim-label';
      heading.textContent = label;
      const detail = document.createElement('p');
      detail.textContent = `${label}: no quoted source passage was returned.`;
      missing.append(heading, detail);
      ui.evidenceList.append(missing);
      return;
    }
    const valid = Boolean(sourceRange(item));
    const button = document.createElement('button');
    button.className = 'evidence-claim';
    button.type = 'button';
    button.disabled = !valid;
    button.dataset.evidenceIndex = String(index);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-controls', 'sourceText');
    const heading = document.createElement('span');
    heading.className = 'claim-heading';
    const title = document.createElement('span');
    title.className = 'claim-label';
    title.textContent = label;
    const action = document.createElement('span');
    action.className = 'claim-source-action';
    action.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4H3V13H12V10M9 3H13V7M13 3L7 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const actionText = document.createElement('span');
    actionText.textContent = valid ? 'Show source' : 'Source reference missing';
    action.append(actionText);
    heading.append(title, action);
    const quote = document.createElement('span');
    quote.className = 'claim-quote';
    quote.textContent = `“${item.value}”`;
    const author = document.createElement('span');
    author.className = 'claim-author';
    author.textContent = hasText(item.author) ? `From ${item.author}` : 'From the reviewed thread';
    button.append(heading, quote, author);
    button.addEventListener('click', () => selectEvidence(index));
    ui.evidenceList.append(button);
  });
  if (!evidence.some((item) => item?.id === 'reply')) {
    const gap = document.createElement('div');
    gap.className = 'missing-evidence';
    const label = document.createElement('span');
    label.className = 'claim-label';
    label.textContent = 'Reply evidence';
    const detail = document.createElement('p');
    detail.textContent = 'Extract returned no quoted reply passage. Read the full reply in the source below.';
    gap.append(label, detail);
    ui.evidenceList.append(gap);
  }
}

function renderSource() {
  ui.sourceText.replaceChildren();
  ui.sourceText.textContent = state.review?.source || 'The reviewed source will appear here.';
  ui.sourceHint.textContent = 'Choose a quotation to find it in the reviewed thread.';
}

function selectEvidence(index) {
  const item = state.review?.evidence?.[index];
  if (!item) return;
  const range = sourceRange(item);
  if (!range) return;
  state.selectedEvidence = index;
  for (const button of ui.evidenceList.querySelectorAll('button')) {
    const selected = Number(button.dataset.evidenceIndex) === index;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  for (const button of ui.termsList.querySelectorAll('button')) {
    const selected = Number(button.dataset.evidenceIndex) === index;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  const mark = document.createElement('mark');
  mark.id = 'selectedSourceQuote';
  mark.textContent = range.points.slice(range.start, range.end).join('');
  ui.sourceText.replaceChildren(
    document.createTextNode(range.points.slice(0, range.start).join('')),
    mark,
    document.createTextNode(range.points.slice(range.end).join('')),
  );
  ui.clearHighlightButton.hidden = false;
  ui.sourceHint.textContent = `${sentenceCase(item.label || item.id)}${hasText(item.author) ? ` from ${item.author}` : ''}. Highlighted at characters ${range.start}–${range.end}.`;
  // Scroll only the source reader; keep the chosen claim and keyboard focus in place.
  ui.sourceText.scrollTop = Math.max(0, mark.offsetTop - ui.sourceText.offsetTop - 42);
  if (window.matchMedia('(max-width: 780px)').matches) {
    ui.sourcePanel.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }
}

function clearHighlight() {
  state.selectedEvidence = null;
  for (const button of ui.evidenceList.querySelectorAll('button')) {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  }
  for (const button of ui.termsList.querySelectorAll('button')) {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  }
  ui.clearHighlightButton.hidden = true;
  renderSource();
}

function renderNativeData() {
  const review = state.review;
  ui.nativeDisclosure.hidden = !review;
  ui.endpointList.replaceChildren();
  const endpoints = Array.isArray(review?.endpoints) ? review.endpoints : [];
  for (const endpoint of endpoints) {
    const name = typeof endpoint === 'string' ? endpoint : endpoint?.name || endpoint?.endpoint || '';
    const key = Object.keys(endpointExplanations).find((candidate) => String(name).toLowerCase().includes(candidate));
    const li = document.createElement('li');
    li.textContent = key ? endpointExplanations[key] : String(name);
    if (li.textContent) ui.endpointList.append(li);
  }
  ui.rawData.textContent = review?.raw ? JSON.stringify(review.raw, null, 2) : 'Native response data is available in the recorded source files.';
}

function usePreset(id) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) return;
  state.input = clone(preset.input);
  state.reviewedInput = clone(preset.input);
  state.review = clone(preset.review);
  state.stale = false;
  state.recorded = true;
  ui.presetSelect.value = preset.id;
  ui.presetDescription.textContent = preset.description || 'A fictional thread with a recorded Clocked review.';
  ui.ourSideInput.value = state.input.ourSide;
  ui.counterpartyInput.value = state.input.counterparty;
  showMessage('');
  renderMessages();
  renderReview();
  announce(`${preset.title} loaded. ${kinds[state.review.kind]?.tag || 'Review ready'}.`);
}

async function loadPresets() {
  try {
    const response = await fetch('./recorded.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('The recorded thread file must contain a list.');
    state.presets = records.filter((record) => record?.id && record?.input?.messages?.length >= 2 && record?.review);
    if (!state.presets.length) throw new Error('No recorded threads were found.');
    ui.presetSelect.replaceChildren();
    for (const preset of state.presets) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.title;
      ui.presetSelect.append(option);
    }
    usePreset(state.presets[0].id);
  } catch (error) {
    ui.presetSelect.replaceChildren();
    const option = document.createElement('option');
    option.textContent = 'Recorded threads unavailable';
    ui.presetSelect.append(option);
    showMessage(`Recorded examples failed to load: ${error.message}. Start the local server and reload the page.`, 'error');
    syncControls();
  }
}

async function loadStatus() {
  try {
    const response = await fetch('./api/status', { cache: 'no-cache' });
    state.live = response.ok && (await response.json()).live === true;
  } catch {
    state.live = false;
  }
  ui.serviceDot.classList.toggle('is-live', state.live);
  ui.serviceLabel.textContent = state.live ? 'Live review ready' : 'Recorded examples';
  ui.liveNote.textContent = state.live
    ? 'Edit the thread, then review it with Clocked.'
    : 'Run locally with your Clocked API key to review another thread.';
  syncControls();
}

function validatedInput() {
  const input = clone(state.input);
  const oldOurs = input.ourSide;
  const oldTheirs = input.counterparty;
  input.ourSide = input.ourSide.trim();
  input.counterparty = input.counterparty.trim();
  if (!input.ourSide || !input.counterparty) throw new Error('Name both parties before reviewing the thread.');
  if (input.ourSide === input.counterparty) throw new Error('Give the two parties distinct names.');
  if (input.messages.length < 2 || input.messages.length > 8) throw new Error('Use one original offer and between one and seven replies.');
  for (const [index, message] of input.messages.entries()) {
    if (message.author === oldOurs) message.author = input.ourSide;
    if (message.author === oldTheirs) message.author = input.counterparty;
    if (!hasText(message.text)) throw new Error(index === 0 ? 'Paste the original offer before reviewing.' : `Reply ${index} is empty. Add the reply’s text or remove it.`);
    if (![input.ourSide, input.counterparty].includes(message.author)) throw new Error(`Choose one of the two parties as the author of message ${index + 1}.`);
    if (message.text.length > 4000) throw new Error(`Keep message ${index + 1} under 4,000 characters.`);
  }
  const offerAuthor = input.messages[0].author;
  if (!input.messages.slice(1).some((message) => message.author !== offerAuthor)) throw new Error('Add a reply from the other party so both sides of the deal can be reviewed.');
  return input;
}

async function reviewThread() {
  if (!state.live || state.busy) return;
  let input;
  try {
    input = validatedInput();
  } catch (error) {
    showMessage(error.message, 'error');
    return;
  }
  state.busy = true;
  showMessage('');
  syncControls();
  announce('Reviewing the thread with Clocked.');
  try {
    const response = await fetch('./api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Review endpoint returned HTTP ${response.status} without a JSON result.`); }
    if (!response.ok) {
      const detail = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
      throw new Error(detail || `HTTP ${response.status}`);
    }
    const review = data.review || data;
    if (!review.kind || typeof review.source !== 'string') throw new Error('The review response is missing its decision or source text.');
    state.input = clone(input);
    state.reviewedInput = clone(input);
    state.review = review;
    state.recorded = false;
    state.stale = false;
    ui.ourSideInput.value = input.ourSide;
    ui.counterpartyInput.value = input.counterparty;
    ui.presetDescription.textContent = 'Your edited thread, reviewed live by Clocked.';
    renderMessages();
    renderReview();
    showMessage(`Thread reviewed. ${kinds[review.kind]?.tag || 'Review ready'}.`);
    announce(`Thread reviewed. ${kinds[review.kind]?.tag || 'Review ready'}.`);
  } catch (error) {
    showMessage(`Review failed: ${error.message}. Your input is still here.`, 'error');
    announce('Review failed. Your input is still here.');
  } finally {
    state.busy = false;
    syncControls();
  }
}

function termsNote() {
  const review = state.review;
  const quotations = (review.evidence || [])
    .filter((item) => item && hasText(item.value) && sourceRange(item))
    .map((item) => `${sentenceCase(item.label || item.id)}${hasText(item.author) ? `, from ${item.author}` : ''}: “${item.value}”\nSource characters ${item.start}–${item.end} (Unicode code points).`);
  return [
    'Terms agreed',
    `${review.payer} pays ${review.payee}.`,
    `Price: ${review.price}`,
    `Work: ${review.scope}`,
    '',
    'Quoted source',
    quotations.join('\n\n'),
  ].join('\n');
}

async function copyTerms() {
  if (!canCopy()) return;
  const note = termsNote();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(note);
    } else {
      const text = document.createElement('textarea');
      text.value = note;
      text.style.position = 'fixed';
      text.style.left = '-9999px';
      document.body.append(text);
      text.select();
      const copied = document.execCommand('copy');
      text.remove();
      if (!copied) throw new Error('The browser blocked clipboard access.');
      ui.copyButton.focus();
    }
    ui.copyButtonText.textContent = 'Terms copied';
    announce('Terms copied with their quoted source.');
  } catch (error) {
    showMessage(`Copy failed: ${error.message} Allow clipboard access and try again.`, 'error');
  }
}

ui.presetSelect.addEventListener('change', () => usePreset(ui.presetSelect.value));
ui.ourSideInput.addEventListener('input', () => renameParty('ourSide', ui.ourSideInput.value));
ui.counterpartyInput.addEventListener('input', () => renameParty('counterparty', ui.counterpartyInput.value));
ui.addMessageButton.addEventListener('click', () => {
  if (state.input.messages.length >= 8 || state.busy) return;
  state.input.messages.push({ author: state.input.counterparty, text: '' });
  markEdited();
  renderMessages();
  ui.messages.lastElementChild.querySelector('textarea').focus();
  announce('Reply added.');
});
ui.reviewButton.addEventListener('click', reviewThread);
ui.copyButton.addEventListener('click', copyTerms);
ui.clearHighlightButton.addEventListener('click', clearHighlight);

ui.ourSideInput.value = state.input.ourSide;
ui.counterpartyInput.value = state.input.counterparty;
renderMessages();
await Promise.allSettled([loadPresets(), loadStatus()]);
