export function initDevPanel({ getStatus, actions, sliders = [], inputs = [], selects = [] }) {
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('dev')) return;

  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.style.cssText = `
    position:fixed;bottom:8px;left:8px;z-index:9999;
    background:rgba(0,0,0,0.8);color:#5ce1ff;padding:8px 10px;
    font:12px monospace;border-radius:6px;max-width:240px;
  `;
  const status = document.createElement('div');
  panel.appendChild(status);

  for (const slider of sliders) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin-top:8px;font-size:11px;';

    const title = document.createElement('span');
    title.textContent = slider.label;
    row.appendChild(title);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(slider.min ?? 0);
    input.max = String(slider.max ?? 2);
    input.step = String(slider.step ?? 0.05);
    input.value = String(slider.value ?? 1);
    input.style.cssText = 'display:block;width:100%;margin-top:4px;cursor:pointer;';
    row.appendChild(input);

    const valueEl = document.createElement('span');
    valueEl.style.cssText = 'color:#e8f4ff;';
    valueEl.textContent = ` ${input.value}`;
    row.appendChild(valueEl);

    input.addEventListener('input', () => {
      valueEl.textContent = ` ${input.value}`;
      slider.onChange(Number(input.value));
    });

    panel.appendChild(row);
  }

  for (const inputCfg of inputs) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;margin-top:8px;align-items:center;';

    const input = document.createElement('input');
    input.type = inputCfg.type ?? 'number';
    input.min = String(inputCfg.min ?? 1);
    input.max = String(inputCfg.max ?? 100);
    input.value = String(inputCfg.value ?? 1);
    input.style.cssText = 'width:52px;padding:2px 4px;';
    if (inputCfg.placeholder) input.placeholder = inputCfg.placeholder;
    row.appendChild(input);

    const btn = document.createElement('button');
    btn.textContent = inputCfg.label ?? 'Go';
    btn.style.cssText = 'flex:1;cursor:pointer;padding:2px 4px;';
    btn.addEventListener('click', () => inputCfg.onSubmit(Number(input.value)));
    row.appendChild(btn);

    panel.appendChild(row);
  }

  for (const selectCfg of selects) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin-top:8px;font-size:11px;';

    const title = document.createElement('span');
    title.textContent = selectCfg.label;
    row.appendChild(title);

    const select = document.createElement('select');
    select.style.cssText = 'display:block;width:100%;margin-top:4px;cursor:pointer;';
    for (const opt of selectCfg.options) {
      const option = document.createElement('option');
      option.value = String(opt.value);
      option.textContent = opt.label;
      select.appendChild(option);
    }
    if (selectCfg.value != null) select.value = String(selectCfg.value);
    select.addEventListener('change', () => selectCfg.onChange(select.value));
    row.appendChild(select);

    panel.appendChild(row);
  }

  for (const { label, fn } of actions) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'display:block;margin-top:4px;width:100%;cursor:pointer;';
    btn.addEventListener('click', fn);
    panel.appendChild(btn);
  }

  document.body.appendChild(panel);
  setInterval(() => { status.textContent = getStatus(); }, 500);
}
