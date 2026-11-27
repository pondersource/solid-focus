const core = 'https://atomicdata.dev/properties/';
const prefix = 'focus-task/v1:';
const fields = [
  ['name', 'Task'], ['workspace', 'Workspace'], ['list', 'List'],
  ['due', 'Due date'], ['notes', 'Notes', true]
];

function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function tasks(store) {
  const {table, rowClass} = await store.getData();
  if (!table || !rowClass) throw new Error('Focus needs a task table.');

  function task(row) {
    if (row.error) throw new Error('Atomic could not read a task.');
    const data = row.get(core + 'description');
    if (row.get(core + 'parent') !== table || !row.get(core + 'isA')?.includes(rowClass) ||
        typeof data !== 'string' || !data.startsWith(prefix)) return;
    return {...JSON.parse(data.slice(prefix.length)), name: row.get(core + 'name'), subject: row.subject};
  }

  return {
    async list() {
      const all = await store.query({property: core + 'parent', value: table});
      if (all.length >= 500) throw new Error('This version supports fewer than 500 rows.');
      const result = [];
      for (let offset = 0; offset < all.length; offset += 100) {
        const rows = await store.getMany(all.slice(offset, offset + 100));
        result.push(...rows.map(task).filter(Boolean));
      }
      return result.sort((first, second) => first.name.localeCompare(second.name));
    },
    async save({subject, name, ...record}) {
      const props = {[core + 'name']: name, [core + 'description']: prefix + JSON.stringify(record)};
      if (!subject) {
        await store.newResource({parent: table, isA: [rowClass], propVals: props});
        return;
      }
      const row = await store.getResource(subject);
      if (!task(row)) throw new Error('That task is outside this task list.');
      for (const [property, value] of Object.entries(props)) row.set(property, value);
      await row.save();
    },
    async remove(subject) {
      const row = await store.getResource(subject);
      if (!task(row)) throw new Error('That task is outside this task list.');
      await row.destroy();
    }
  };
}

export async function view({root, store}) {
  const taskList = await tasks(store);
  const style = el('style', `
    main { max-width: 60rem; margin: auto; padding: 1.25rem; font: 1rem system-ui; }
    fieldset { display: grid; gap: .6rem; }
    fieldset label, fieldset input, textarea { display: block; width: 100%; box-sizing: border-box; }
    textarea { min-height: 4rem; }
    input, textarea, button { font: inherit; padding: .35rem; }
    button { margin: .2rem .4rem .2rem 0; }
    article { border-top: 1px solid #8886; margin-block: 1rem; padding-block: .5rem; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  `);
  const main = el('main');
  const editor = el('fieldset');
  editor.append(el('legend', 'Task details'));
  const input = {};
  for (const [key, label, multiline] of fields) {
    input[key] = el(multiline ? 'textarea' : 'input');
    if (key === 'due') input[key].type = 'date';
    const wrapper = el('label', label);
    wrapper.append(input[key]);
    editor.append(wrapper);
  }
  const actions = el('div');
  const save = el('button', 'Add task');
  const cancel = el('button', 'Cancel edit');
  actions.append(save, cancel);
  editor.append(actions);
  const status = el('p');
  status.setAttribute('role', 'status');
  const filterLabel = el('label', 'Find tasks');
  const filter = el('input');
  filter.type = 'search';
  filterLabel.append(filter);
  const includeDone = el('input');
  includeDone.type = 'checkbox';
  const includeLabel = el('label', 'Show completed tasks');
  includeLabel.append(includeDone);
  const results = el('section');
  main.append(el('h1', 'Focus'), editor, status, filterLabel, includeLabel, results);
  root.replaceChildren(style, main);

  let all = [];
  let selected;
  let busy = false;

  function edit(record) {
    selected = record;
    for (const [key] of fields) {
      input[key].value = record?.[key] || '';
    }
    save.textContent = record ? 'Save task' : 'Add task';
    cancel.hidden = !record;
  }

  function render() {
    results.replaceChildren();
    const query = filter.value.trim().toLocaleLowerCase();
    const groups = new Map();
    for (const task of all) {
      if (task.done && !includeDone.checked) continue;
      if (![task.name, task.workspace, task.list, task.notes].join(' ').toLocaleLowerCase().includes(query)) continue;
      const group = task.workspace + ' / ' + task.list;
      let section = groups.get(group);
      if (!section) {
        section = el('section');
        section.append(el('h2', group));
        groups.set(group, section);
        results.append(section);
      }
      const card = el('article');
      card.append(el('h3', task.name));
      if (task.due) card.append(el('p', 'Due ' + task.due));
      if (task.notes) card.append(el('pre', task.notes));
      const status = el('button', task.done ? 'Reopen task' : 'Complete task');
      status.addEventListener('click', () => run(async () => {
        await taskList.save({...task, done: !task.done});
        if (selected?.subject === task.subject) selected = {...task, done: !task.done};
      }, task.done ? 'Task reopened.' : 'Task completed.'));
      const change = el('button', 'Edit task');
      change.addEventListener('click', () => { if (!busy) edit(task); });
      const remove = el('button', 'Delete task');
      remove.addEventListener('click', () => {
        if (busy || !window.confirm('Delete ' + task.name + '?')) return;
        run(async () => {
          await taskList.remove(task.subject);
          if (selected?.subject === task.subject) edit();
        }, 'Task deleted.');
      });
      card.append(status, change, remove);
      section.append(card);
    }
    if (!results.children.length) results.append(el('p', 'No matching tasks.'));
  }

  async function run(operation, message) {
    if (busy) return;
    busy = editor.disabled = true;
    status.textContent = '';
    try {
      await operation();
      all = await taskList.list();
      render();
      status.textContent = message;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = editor.disabled = false;
    }
  }

  filter.addEventListener('input', render);
  includeDone.addEventListener('change', render);
  cancel.addEventListener('click', () => edit());
  save.addEventListener('click', () => run(async () => {
    const name = input.name.value.trim();
    if (!name) throw new Error('Enter a task name.');
    await taskList.save({
      subject: selected?.subject,
      name,
      workspace: input.workspace.value.trim() || 'Personal',
      list: input.list.value.trim() || 'Inbox',
      due: input.due.value,
      notes: input.notes.value,
      done: selected?.done ?? false
    });
    edit();
  }, 'Task saved.'));
  edit();
  await run(async () => {}, '');
}
