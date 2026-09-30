// Stimulus controller for datastore/widgets.py::TablePickerWidget.
// The hidden input is the only thing submitted (a value, or a JSON list in
// multiple mode); everything else here is UI over the embedded config rows.
(() => {
    const register = () => {
        const {Controller} = window.StimulusModule;

        class TablePicker extends Controller {
            static targets = ['hint', 'selected', 'search', 'filter', 'deprecated', 'toggle', 'count', 'table', 'body'];

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
                if (this.hasDeprecatedTarget) {
                    this.deprecatedTarget.closest('label').hidden = !this.rows.some((row) => row.deprecated);
                }
                [this.searchTarget, ...this.filterTargets, ...this.deprecatedTargets].forEach((control) =>
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
                this.renderCount(this.offered.length);
            }

            // Rows the deprecated toggle allows (a selected row always shows,
            // so it can be deselected).
            get offered() {
                const showDeprecated = this.hasDeprecatedTarget && this.deprecatedTarget.checked;
                const selected = new Set(this.values);
                return this.rows.filter((row) => showDeprecated || !row.deprecated || selected.has(row.value));
            }

            // [{value, label}] whatever the storage shape; label only when
            // `labelled` ([valueKey, labelKey] into stored objects).
            get entries() {
                if (!this.multiple) return this.input.value ? [{value: this.input.value}] : [];
                let stored;
                try {
                    stored = JSON.parse(this.input.value || '[]');
                } catch {
                    stored = [];
                }
                if (!this.labelled) return stored.map((value) => ({value}));
                const [valueKey, labelKey] = this.labelled;
                return stored.map((item) => ({value: item[valueKey], label: item[labelKey] || ''}));
            }

            writeEntries(entries) {
                if (!this.multiple) {
                    this.input.value = entries[0]?.value || '';
                } else if (this.labelled) {
                    const [valueKey, labelKey] = this.labelled;
                    this.input.value = JSON.stringify(
                        entries.map((e) => ({[valueKey]: e.value, [labelKey]: e.label || ''})));
                } else {
                    this.input.value = JSON.stringify(entries.map((e) => e.value));
                }
                this.input.dispatchEvent(new Event('change', {bubbles: true}));
            }

            get values() {
                return this.entries.map((e) => e.value);
            }

            set values(values) {
                const labels = new Map(this.entries.map((e) => [e.value, e.label]));
                this.writeEntries(values.map((value) => ({value, label: labels.get(value) || ''})));
                this.renderSelected();
                if (!this.tableTarget.hidden) this.renderTable();
            }

            renderSelected() {
                const entries = this.entries;
                const values = entries.map((e) => e.value);
                const reorderable = this.ordered && values.length > 1;
                this.selectedTarget.replaceChildren(...values.map((value, index) => {
                    const row = this.byValue.get(value) || {value, name: `${value} (missing)`};
                    const item = document.createElement('li');
                    const el = (tag, className, text) => {
                        const node = document.createElement(tag);
                        node.className = className;
                        if (text != null) node.textContent = text;
                        return node;
                    };
                    if (reorderable) item.append(el('span', 'tp-pos', `${index + 1}`));
                    const info = el('div', 'tp-info');
                    info.append(
                        el('strong', 'tp-name', row.name),
                        el('span', 'tp-meta', [...this.metaKeys.map((key) => row[key]), row.deprecated && 'deprecated']
                            .filter(Boolean).join(' · ')),
                    );
                    item.append(info);
                    if (this.labelled) {
                        // A captioned field, so it reads as editable. Typing
                        // edits the stored label in place; no re-render, so
                        // focus stays in the field.
                        const field = el('label', 'tp-label-field');
                        const input = el('input', 'tp-label');
                        input.type = 'text';
                        input.value = entries[index].label;
                        input.placeholder = row.name;
                        input.title = 'Leave blank to use the module name';
                        input.addEventListener('input', () => {
                            const next = this.entries;
                            next[index].label = input.value;
                            this.writeEntries(next);
                        });
                        input.addEventListener('keydown', (event) => event.key === 'Enter' && event.preventDefault());
                        field.append(el('span', 'tp-label-caption', 'Button text'), input);
                        item.append(field);
                    }
                    const actions = el('div', 'tp-actions');
                    const button = (text, title, onClick, disabled = false) => {
                        const btn = el('button', 'button button-small button-secondary', text);
                        btn.type = 'button';
                        btn.title = title;
                        btn.disabled = disabled;
                        btn.setAttribute('aria-label', `${title}: ${row.name}`);
                        btn.addEventListener('click', onClick);
                        actions.append(btn);
                        return btn;
                    };
                    const move = (delta) => {
                        const next = [...values];
                        next.splice(index + delta, 0, next.splice(index, 1)[0]);
                        this.values = next;
                    };
                    if (reorderable) {
                        // Disabled at the ends rather than omitted, so the
                        // controls line up down the list.
                        button('↑', 'Move up', () => move(-1), index === 0);
                        button('↓', 'Move down', () => move(1), index === values.length - 1);
                    }
                    button('✕ Remove', 'Remove from this selection (the module itself is not deleted)',
                        () => (this.values = values.filter((v) => v !== value))).classList.add('tp-remove');
                    item.append(actions);
                    return item;
                }));
                this.hintTarget.textContent = [
                    reorderable && 'Shown in this order. Use ↑ ↓ to reorder; Remove only drops it from this list.',
                    this.labelled && values.length && 'Edit each button\'s text in its field (blank = module name).',
                ].filter(Boolean).join(' ');
                this.hintTarget.hidden = !this.hintTarget.textContent;
                this.selectedTarget.hidden = values.length === 0;
                this.toggleTarget.textContent = this.tableTarget.hidden
                    ? (!this.multiple && values.length ? 'Change' : `Browse ${this.noun}`)
                    : 'Close';
            }

            matches(row) {
                const query = this.searchTarget.value.trim().toLowerCase();
                return this.filterTargets.every((select) => !select.value || String(row[select.dataset.key]) === select.value)
                    && (!query || Object.entries(row).some(([key, text]) =>
                        key !== 'value' && key !== 'deprecated' && text != null && String(text).toLowerCase().includes(query)));
            }

            renderTable() {
                const selected = new Set(this.values);
                const offered = this.offered;
                const visible = offered.filter((row) => this.matches(row));
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
                    tr.classList.toggle('tp-deprecated', Boolean(row.deprecated));
                    tr.addEventListener('click', (event) => event.target !== box && box.click());
                    return tr;
                }));
                this.renderCount(visible.length, offered.length);
            }

            renderCount(shown, total = shown) {
                this.countTarget.textContent = `${shown} of ${total} ${this.noun}`;
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
