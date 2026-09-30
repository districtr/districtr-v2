// Stimulus controller for datastore/widgets.py::TablePickerWidget.
// The hidden input is the only thing submitted (a value, or a JSON list in
// multiple mode); everything else here is UI over the embedded config rows.
(() => {
    const register = () => {
        const {Controller} = window.StimulusModule;

        class TablePicker extends Controller {
            static targets = ['selected', 'search', 'filter', 'toggle', 'count', 'table', 'body'];

            connect() {
                this.input = this.element.querySelector('input[type="hidden"]');
                const config = JSON.parse(this.element.querySelector('script[type="application/json"]').textContent);
                Object.assign(this, config);
                this.byValue = new Map(this.rows.map((row) => [row.value, row]));
                // Columns after the name describe a selected item.
                this.metaKeys = this.columns.slice(1).map(([key]) => key).filter((key) => key !== 'description');
                this.filterTargets.forEach((select) => {
                    const key = select.dataset.key;
                    const seen = new Map();
                    this.rows.forEach((row) => row[key] && seen.set(row[key], row[`${key}Label`] || row[key]));
                    [...seen].sort((a, b) => String(a[1]).localeCompare(String(b[1]))).forEach(([value, text]) =>
                        select.add(new Option(text, value)));
                    select.hidden = seen.size === 0;
                });
                [this.searchTarget, ...this.filterTargets].forEach((control) =>
                    control.addEventListener('input', () => this.open()));
                // Enter in the search box must not submit the page form (or
                // advance the portal wizard).
                this.searchTarget.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                });
                this.renderSelected();
                this.renderCount(this.rows.length);
            }

            get values() {
                if (!this.multiple) return this.input.value ? [this.input.value] : [];
                try {
                    return JSON.parse(this.input.value || '[]');
                } catch {
                    return [];
                }
            }

            set values(values) {
                this.input.value = this.multiple ? JSON.stringify(values) : values[0] || '';
                this.input.dispatchEvent(new Event('change', {bubbles: true}));
                this.renderSelected();
                if (!this.tableTarget.hidden) this.renderTable();
            }

            renderSelected() {
                const values = this.values;
                this.selectedTarget.replaceChildren(...values.map((value, index) => {
                    const row = this.byValue.get(value) || {value, name: `${value} (missing)`};
                    const item = document.createElement('li');
                    const name = document.createElement('strong');
                    name.textContent = row.name;
                    const meta = document.createElement('span');
                    meta.className = 'tp-meta';
                    meta.textContent = this.metaKeys.map((key) => row[key]).filter(Boolean).join(' · ');
                    item.append(name, meta);
                    const button = (text, title, onClick) => {
                        const el = document.createElement('button');
                        el.type = 'button';
                        el.className = 'button button-small button-secondary';
                        el.textContent = text;
                        el.title = title;
                        el.setAttribute('aria-label', `${title}: ${row.name}`);
                        el.addEventListener('click', onClick);
                        item.append(el);
                    };
                    const move = (delta) => {
                        const next = [...values];
                        next.splice(index + delta, 0, next.splice(index, 1)[0]);
                        this.values = next;
                    };
                    if (this.ordered && values.length > 1) {
                        if (index > 0) button('↑', 'Move up', () => move(-1));
                        if (index < values.length - 1) button('↓', 'Move down', () => move(1));
                    }
                    button('✕', 'Remove', () => (this.values = values.filter((v) => v !== value)));
                    return item;
                }));
                this.selectedTarget.hidden = values.length === 0;
                this.toggleTarget.textContent = this.tableTarget.hidden
                    ? (!this.multiple && values.length ? 'Change' : `Browse ${this.noun}`)
                    : 'Close';
            }

            matches(row) {
                const query = this.searchTarget.value.trim().toLowerCase();
                return this.filterTargets.every((select) => !select.value || String(row[select.dataset.key]) === select.value)
                    && (!query || Object.entries(row).some(([key, text]) =>
                        key !== 'value' && text != null && String(text).toLowerCase().includes(query)));
            }

            renderTable() {
                const selected = new Set(this.values);
                const visible = this.rows.filter((row) => this.matches(row));
                this.bodyTarget.replaceChildren(...visible.map((row) => {
                    const tr = document.createElement('tr');
                    const box = document.createElement('input');
                    box.type = this.multiple ? 'checkbox' : 'radio';
                    box.checked = selected.has(row.value);
                    box.setAttribute('aria-label', `Select ${row.name}`);
                    box.addEventListener('change', () => this.pick(row.value, box.checked));
                    const cell = document.createElement('td');
                    cell.append(box);
                    tr.append(cell);
                    this.columns.forEach(([key]) => {
                        const td = document.createElement('td');
                        td.textContent = row[`${key}Label`] || (row[key] ?? '');
                        td.title = td.textContent;
                        tr.append(td);
                    });
                    tr.classList.toggle('tp-picked', box.checked);
                    tr.addEventListener('click', (event) => event.target !== box && box.click());
                    return tr;
                }));
                this.renderCount(visible.length);
            }

            renderCount(shown) {
                this.countTarget.textContent = `${shown} of ${this.rows.length} ${this.noun}`;
            }

            pick(value, checked) {
                if (!this.multiple) {
                    this.values = [value];
                    this.close();
                    return;
                }
                const values = this.values.filter((v) => v !== value);
                this.values = checked ? [...values, value] : values;
            }

            open() {
                this.tableTarget.hidden = false;
                this.renderTable();
                this.renderSelected();
            }

            close() {
                this.tableTarget.hidden = true;
                this.renderSelected();
            }

            toggle() {
                this.tableTarget.hidden ? this.open() : this.close();
            }
        }

        window.wagtail.app.register('table-picker', TablePicker);
    };

    if (window.wagtail?.app && window.StimulusModule) register();
    else document.addEventListener('DOMContentLoaded', register);
})();
