/* Paintball Wars 3D: Brain Boost questions (easy math and Spanish), the same set as the top-down game.
   Levels: 6 and 7 (about 1st-2nd grade) … 11 (about 6th grade). Age 7 asks level 7, age 10 asks level 10;
   challenge questions are one level harder, and after two misses a few come one level easier.
   A question is { q, pic, swatch, opts: [{ label, sub, color, big }], answer, say, sayPrompt, explain }. */
(() => {
  'use strict';
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function numOpts(ans, min = 0) {
    const set = new Set([ans]);
    while (set.size < 3) { const d = ans + ri(-3, 3); if (d >= min && d !== ans) set.add(d); }
    return shuffle([...set]);
  }

  // Questions as { q, pic, swatch, opts: [{ label, sub, color, big }], answer, say, explain }
  // Levels 6 and 7 (the original "easier" and "normal" sets)
  function mathQuestion(easy) {
    const kinds = easy ? ['add10', 'add10', 'count'] : ['add20', 'add20', 'sub', 'sub', 'count', 'bigger', 'missing', 'add10'];
    const k = pick(kinds);
    const asNums = (q, ans, explain, extra = {}) => {
      const opts = numOpts(ans, k === 'count' || k === 'missing' ? 1 : 0);
      return { q, opts: opts.map(n => ({ label: String(n) })), answer: opts.indexOf(ans), explain, ...extra };
    };
    if (k === 'add10' || k === 'add20') {
      const max = k === 'add10' ? 10 : 20, a = ri(1, max - 1), b = ri(1, max - a);
      return asNums(`${a} + ${b} = ?`, a + b, `${a} + ${b} = ${a + b}`);
    }
    if (k === 'sub') {
      const a = ri(5, 20), b = ri(1, a - 1);
      return asNums(`${a} − ${b} = ?`, a - b, `${a} − ${b} = ${a - b}`);
    }
    if (k === 'missing') {
      const a = ri(1, 9), b = ri(1, 9);
      return asNums(`${a} + ? = ${a + b}`, b, `${a} + ${b} = ${a + b}`);
    }
    if (k === 'bigger') {
      const set = new Set();
      while (set.size < 3) set.add(ri(5, 60));
      const nums = shuffle([...set]), max = Math.max(...nums);
      return { q: 'Which number is the biggest?', opts: nums.map(n => ({ label: String(n) })), answer: nums.indexOf(max), explain: `${max} is the biggest` };
    }
    const thing = pick(['🍎', '⭐', '🐟', '🎈', '🍪', '🐞', '⚽', '🍓']), n = ri(easy ? 2 : 4, easy ? 6 : 10);
    return asNums('How many?', n, `There are ${n}`, { pic: thing.repeat(n) });
  }

  const ES = {
    animals: [['perro', 'dog', '🐶'], ['gato', 'cat', '🐱'], ['pájaro', 'bird', '🐦'], ['pez', 'fish', '🐟'], ['vaca', 'cow', '🐮'],
      ['caballo', 'horse', '🐴'], ['cerdo', 'pig', '🐷'], ['pato', 'duck', '🦆'], ['ratón', 'mouse', '🐭'], ['oso', 'bear', '🐻'],
      ['conejo', 'rabbit', '🐰'], ['león', 'lion', '🦁'], ['mono', 'monkey', '🐵'], ['rana', 'frog', '🐸']],
    food: [['manzana', 'apple', '🍎'], ['plátano', 'banana', '🍌'], ['leche', 'milk', '🥛'], ['pan', 'bread', '🍞'], ['queso', 'cheese', '🧀'],
      ['huevo', 'egg', '🥚'], ['galleta', 'cookie', '🍪'], ['helado', 'ice cream', '🍦'], ['uvas', 'grapes', '🍇'], ['zanahoria', 'carrot', '🥕']],
    things: [['sol', 'sun', '☀️'], ['luna', 'moon', '🌙'], ['casa', 'house', '🏠'], ['árbol', 'tree', '🌳'], ['flor', 'flower', '🌸'],
      ['pelota', 'ball', '⚽'], ['libro', 'book', '📖'], ['carro', 'car', '🚗'], ['estrella', 'star', '⭐'], ['agua', 'water', '💧']],
  };
  const COLORS_ES = [['rojo', 'red', '#ff3b30'], ['azul', 'blue', '#2f7bff'], ['verde', 'green', '#2fbf4a'], ['amarillo', 'yellow', '#ffd60a'],
    ['naranja', 'orange', '#ff8a1f'], ['morado', 'purple', '#9b4dff'], ['rosa', 'pink', '#ff7eb6'], ['negro', 'black', '#111111'],
    ['blanco', 'white', '#ffffff'], ['café', 'brown', '#8b5a2b']];
  const NUMS_ES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
  const PHRASES = [['hola', 'hello'], ['adiós', 'goodbye'], ['gracias', 'thank you'], ['por favor', 'please'], ['sí', 'yes'], ['buenos días', 'good morning']];

  function threeFrom(list, item) { return shuffle([item, ...shuffle(list.filter(x => x !== item)).slice(0, 2)]); }
  function spanishQuestion(easy) {
    const kinds = easy ? ['picToWord', 'colorToWord', 'numToDigit'] : ['picToWord', 'picToWord', 'wordToPic', 'colorToWord', 'wordToColor', 'numToDigit', 'digitToNum', 'phrase'];
    const k = pick(kinds);
    if (k === 'picToWord' || k === 'wordToPic') {
      const list = ES[pick(Object.keys(ES))], item = pick(list), opts = threeFrom(list, item);
      if (k === 'picToWord') return { q: 'What is it in Spanish?', pic: item[2], opts: opts.map(o => ({ label: o[0] })), answer: opts.indexOf(item),
        say: item[0], explain: `${item[2]} = ${item[0]} (${item[1]})` };
      return { q: `Which one is “${item[0]}”?`, sayPrompt: item[0], opts: opts.map(o => ({ label: o[2], big: true })), answer: opts.indexOf(item),
        say: item[0], explain: `${item[0]} = ${item[2]} ${item[1]}` };
    }
    if (k === 'colorToWord' || k === 'wordToColor') {
      const item = pick(COLORS_ES), opts = threeFrom(COLORS_ES, item);
      if (k === 'colorToWord') return { q: 'What color is this in Spanish?', swatch: item[2], opts: opts.map(o => ({ label: o[0] })), answer: opts.indexOf(item),
        say: item[0], explain: `${item[0]} = ${item[1]}` };
      return { q: `Which color is “${item[0]}”?`, sayPrompt: item[0], opts: opts.map(o => ({ label: '', color: o[2], sub: '' })), answer: opts.indexOf(item),
        say: item[0], explain: `${item[0]} = ${item[1]}` };
    }
    if (k === 'numToDigit' || k === 'digitToNum') {
      const n = ri(easy ? 1 : 1, 10), opts = numOpts(n, 0).map(x => Math.min(10, x));
      const uniq = [...new Set(opts)];
      while (uniq.length < 3) { const x = ri(0, 10); if (!uniq.includes(x)) uniq.push(x); }
      const o3 = shuffle(uniq.slice(0, 3).includes(n) ? uniq.slice(0, 3) : [n, ...uniq.filter(x => x !== n).slice(0, 2)]);
      if (k === 'numToDigit') return { q: `What number is “${NUMS_ES[n]}”?`, sayPrompt: NUMS_ES[n], opts: o3.map(x => ({ label: String(x) })), answer: o3.indexOf(n),
        say: NUMS_ES[n], explain: `${NUMS_ES[n]} = ${n}` };
      return { q: `How do you say ${n} in Spanish?`, opts: o3.map(x => ({ label: NUMS_ES[x] })), answer: o3.indexOf(n), say: NUMS_ES[n], explain: `${n} = ${NUMS_ES[n]}` };
    }
    const item = pick(PHRASES), opts = threeFrom(PHRASES, item);
    return { q: `What does “${item[0]}” mean?`, sayPrompt: item[0], opts: opts.map(o => ({ label: o[1] })), answer: opts.indexOf(item), say: item[0],
      explain: `${item[0]} = ${item[1]}` };
  }
  // ----- Harder levels (8 = about 3rd grade … 11 = about 6th grade) -----
  // A question with text answers: the right one plus two wrong ones
  function textQ(q, right, wrongs, explain, extra = {}) {
    let pool = shuffle([...new Set(wrongs.filter(w => w !== right))]);
    if (pool.length < 2 && typeof right === 'number') pool = [...new Set([...pool, ...nearNums(right)])]; // wrong answers came out equal: top up
    const opts = shuffle([right, ...pool.slice(0, 2)]);
    return { q, opts: opts.map(o => ({ label: String(o) })), answer: opts.indexOf(right), explain, ...extra };
  }
  // Wrong answers that look plausible for bigger numbers (off by 1, 2 or 10)
  function nearNums(ans, min = 0) {
    return shuffle([ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10].filter(x => x >= min && x !== ans));
  }
  const numQ = (q, ans, explain, extra) => textQ(q, ans, nearNums(ans), explain, extra);

  function mathLevel(level) {
    if (level <= 7) return mathQuestion(level <= 6);
    if (level === 8) {
      const k = pick(['add', 'add', 'sub', 'sub', 'times', 'skip', 'biggest', 'half']);
      if (k === 'add') { const a = ri(12, 79), b = ri(5, 99 - a); return numQ(`${a} + ${b} = ?`, a + b, `${a} + ${b} = ${a + b}`); }
      if (k === 'sub') { const a = ri(25, 99), b = ri(5, a - 5); return numQ(`${a} − ${b} = ?`, a - b, `${a} − ${b} = ${a - b}`); }
      if (k === 'times') { const a = pick([2, 5, 10]), b = ri(1, 10); return numQ(`${a} × ${b} = ?`, a * b, `${a} × ${b} = ${a * b}`); }
      if (k === 'skip') {
        const st = pick([2, 5, 10]), s0 = st * ri(1, 6), seq = [s0, s0 + st, s0 + 2 * st];
        return textQ(`What comes next? ${seq.join(', ')}, …`, s0 + 3 * st, [s0 + 3 * st + 1, s0 + 4 * st, s0 + 2 * st + 1, s0 + 3 * st - 1], `Counting by ${st}s: ${s0 + 3 * st}`);
      }
      if (k === 'biggest') {
        const set = new Set(); while (set.size < 3) set.add(ri(100, 999));
        const nums = [...set], max = Math.max(...nums);
        return textQ('Which number is the biggest?', max, nums.filter(n => n !== max), `${max} is the biggest`);
      }
      const n = 2 * ri(2, 15); return numQ(`What is half of ${n}?`, n / 2, `Half of ${n} is ${n / 2}`);
    }
    if (level === 9) {
      const k = pick(['times', 'times', 'divide', 'divide', 'add', 'round', 'missing']);
      if (k === 'times') { const a = ri(3, 10), b = ri(3, 10); return textQ(`${a} × ${b} = ?`, a * b, [a * b + a, a * b - b, a * b + 1, a + b], `${a} × ${b} = ${a * b}`); }
      if (k === 'divide') { const b = ri(2, 10), c = ri(2, 10); return numQ(`${b * c} ÷ ${b} = ?`, c, `${b * c} ÷ ${b} = ${c}`); }
      if (k === 'add') { const a = ri(120, 600), b = ri(110, 999 - a); return textQ(`${a} + ${b} = ?`, a + b, [a + b + 10, a + b - 10, a + b + 100, a + b - 1], `${a} + ${b} = ${a + b}`); }
      if (k === 'round') {
        let n = ri(11, 99); if (n % 10 === 5 || n % 10 === 0) n++;
        const r10 = Math.round(n / 10) * 10, other = r10 > n ? r10 - 10 : r10 + 10;
        return textQ(`Round ${n} to the nearest ten`, r10, [other, r10 + 10, n], `${n} rounds to ${r10}`);
      }
      const a = ri(3, 9), b = ri(3, 9); return numQ(`? × ${a} = ${a * b}`, b, `${b} × ${a} = ${a * b}`);
    }
    if (level === 10) {
      const k = pick(['mul', 'mul', 'div', 'frac', 'frac', 'addfrac', 'place']);
      if (k === 'mul') { const a = ri(12, 49), b = ri(2, 9); return textQ(`${a} × ${b} = ?`, a * b, [a * b + 10, a * b - b, a * b + 1, a * (b + 1)], `${a} × ${b} = ${a * b}`); }
      if (k === 'div') { const c = ri(11, 25), b = ri(2, 5); return numQ(`${b * c} ÷ ${b} = ?`, c, `${b * c} ÷ ${b} = ${c}`); }
      if (k === 'frac') { const d = pick([2, 3, 4, 5]), n = d * ri(2, 10); return numQ(`What is 1/${d} of ${n}?`, n / d, `${n} ÷ ${d} = ${n / d}`); }
      if (k === 'addfrac') {
        const d = ri(4, 9), a = ri(1, d - 2), b = ri(1, d - 1 - a);
        return textQ(`${a}/${d} + ${b}/${d} = ?`, `${a + b}/${d}`, [`${a + b}/${d * 2}`, `${a * b}/${d}`, `${a + b + 1}/${d}`], `${a}/${d} + ${b}/${d} = ${a + b}/${d}`);
      }
      const n = ri(1000, 9999), digits = String(n), place = pick([['ones', 3], ['tens', 2], ['hundreds', 1], ['thousands', 0]]);
      const right = digits[place[1]];
      return textQ(`Which digit is in the ${place[0]} place of ${n.toLocaleString('en-US')}?`, right, digits.split('').filter(d => d !== right).concat(['0', '9']), `The ${place[0]} digit is ${right}`);
    }
    const k = pick(['dec', 'dec', 'fracOf', 'percent', 'order', 'mul2']);
    if (k === 'dec') {
      const a = ri(11, 59) / 10, b = ri(11, 39) / 10, sum = Math.round((a + b) * 10) / 10, f = (x) => x.toFixed(1);
      return textQ(`${f(a)} + ${f(b)} = ?`, f(sum), [f(sum + 0.1), f(sum - 0.1), f(sum + 1), f(sum - 1)], `${f(a)} + ${f(b)} = ${f(sum)}`);
    }
    if (k === 'fracOf') { const d = pick([4, 5, 10]), t = pick({ 4: [3], 5: [2, 3, 4], 10: [3, 7, 9] }[d]), n = d * ri(2, 8); return numQ(`What is ${t}/${d} of ${n}?`, n / d * t, `${n} ÷ ${d} × ${t} = ${n / d * t}`); }
    if (k === 'percent') { const pc = pick([10, 25, 50]), n = (100 / pc) * ri(2, 12); return numQ(`What is ${pc}% of ${n}?`, n * pc / 100, `${pc}% of ${n} is ${n * pc / 100}`); }
    if (k === 'order') { const a = ri(2, 9), b = ri(2, 6), c = ri(2, 6); return textQ(`${a} + ${b} × ${c} = ?`, a + b * c, [(a + b) * c, a + b + c, a * b + c], `Multiply first: ${b} × ${c} = ${b * c}, then + ${a} = ${a + b * c}`); }
    const a = ri(11, 15), b = ri(11, 15); return textQ(`${a} × ${b} = ?`, a * b, [a * b + 10, a * b - 10, a * b + 1, a * b - a], `${a} × ${b} = ${a * b}`);
  }

  // Spanish word lists for the harder levels: [spanish, english, picture]
  const ES2 = {
    family: [['madre', 'mother', '👩'], ['padre', 'father', '👨'], ['hermano', 'brother', '👦'], ['hermana', 'sister', '👧'],
      ['abuela', 'grandma', '👵'], ['abuelo', 'grandpa', '👴'], ['bebé', 'baby', '👶']],
    body: [['cabeza', 'head', '🙂'], ['mano', 'hand', '✋'], ['pie', 'foot', '🦶'], ['ojo', 'eye', '👁️'], ['boca', 'mouth', '👄'],
      ['nariz', 'nose', '👃'], ['oreja', 'ear', '👂'], ['diente', 'tooth', '🦷']],
    weather: [['lluvia', 'rain', '🌧️'], ['nieve', 'snow', '❄️'], ['viento', 'wind', '💨'], ['nube', 'cloud', '☁️'], ['sol', 'sun', '☀️'], ['frío', 'cold', '🥶']],
    school: [['lápiz', 'pencil', '✏️'], ['mochila', 'backpack', '🎒'], ['maestra', 'teacher', '👩‍🏫'], ['escuela', 'school', '🏫'],
      ['tijeras', 'scissors', '✂️'], ['regla', 'ruler', '📏'], ['libro', 'book', '📖']],
    verbs: [['comer', 'to eat', '🍽️'], ['dormir', 'to sleep', '😴'], ['correr', 'to run', '🏃'], ['nadar', 'to swim', '🏊'],
      ['leer', 'to read', '📖'], ['cantar', 'to sing', '🎤'], ['bailar', 'to dance', '💃'], ['beber', 'to drink', '🥤']],
    clothes: [['camisa', 'shirt', '👕'], ['zapatos', 'shoes', '👟'], ['sombrero', 'hat', '👒'], ['pantalones', 'pants', '👖'],
      ['calcetines', 'socks', '🧦'], ['vestido', 'dress', '👗'], ['chaqueta', 'jacket', '🧥']],
  };
  const DAYS = [['lunes', 'Monday'], ['martes', 'Tuesday'], ['miércoles', 'Wednesday'], ['jueves', 'Thursday'], ['viernes', 'Friday'], ['sábado', 'Saturday'], ['domingo', 'Sunday']];
  const MONTHS = [['enero', 'January'], ['febrero', 'February'], ['marzo', 'March'], ['abril', 'April'], ['mayo', 'May'], ['junio', 'June'],
    ['julio', 'July'], ['agosto', 'August'], ['septiembre', 'September'], ['octubre', 'October'], ['noviembre', 'November'], ['diciembre', 'December']];
  const OPPOSITES = [['grande', 'big'], ['pequeño', 'small'], ['rápido', 'fast'], ['lento', 'slow'], ['feliz', 'happy'], ['triste', 'sad'],
    ['alto', 'tall'], ['bajo', 'short'], ['caliente', 'hot'], ['frío', 'cold']];
  const PHRASES2 = [['Tengo hambre', "I'm hungry"], ['Tengo sed', "I'm thirsty"], ['Me llamo Ana', 'My name is Ana'], ['¿Cómo estás?', 'How are you?'],
    ['Estoy cansado', "I'm tired"], ['¿Dónde está el baño?', 'Where is the bathroom?'], ['Hace frío', "It's cold"], ['Te quiero', 'I love you'],
    ['¿Cuántos años tienes?', 'How old are you?']];
  const SENTENCES = [['El perro es grande', 'The dog is big'], ['La casa es roja', 'The house is red'], ['Yo como pan', 'I eat bread'],
    ['Ella lee un libro', 'She reads a book'], ['Mi gato duerme', 'My cat sleeps'], ['Nosotros jugamos', 'We play'], ['Hoy hace sol', "Today it's sunny"],
    ['Tú corres rápido', 'You run fast']];
  const QWORDS = [['¿Qué?', 'What?'], ['¿Quién?', 'Who?'], ['¿Dónde?', 'Where?'], ['¿Cuándo?', 'When?'], ['¿Por qué?', 'Why?'], ['¿Cuántos?', 'How many?']];
  const CONJ = [['yo como', 'I eat'], ['tú comes', 'you eat'], ['él come', 'he eats'], ['yo bebo', 'I drink'], ['ella bebe', 'she drinks'], ['yo corro', 'I run'], ['tú corres', 'you run']];
  const TEENS = ['once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];
  const TENS = { 20: 'veinte', 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta', 80: 'ochenta', 90: 'noventa', 100: 'cien' };
  const VEINTI = ['veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  function numEs(n) {
    if (n <= 10) return NUMS_ES[n];
    if (n <= 20) return TEENS[n - 11];
    if (n < 30) return VEINTI[n - 21];
    return n % 10 ? `${TENS[n - n % 10]} y ${NUMS_ES[n % 10]}` : TENS[n];
  }
  // Generic Spanish question kinds over a [spanish, english, picture?] list
  const meaningQ = (list) => { const it = pick(list), o = threeFrom(list, it);
    return { q: `What does “${it[0]}” mean?`, sayPrompt: it[0], say: it[0], opts: o.map(x => ({ label: x[1] })), answer: o.indexOf(it), explain: `${it[0]} = ${it[1]}` }; };
  const sayItQ = (list) => { const it = pick(list), o = threeFrom(list, it);
    return { q: `How do you say “${it[1]}” in Spanish?`, say: it[0], opts: o.map(x => ({ label: x[0] })), answer: o.indexOf(it), explain: `${it[1]} = ${it[0]}` }; };
  const picQ = (list) => { const it = pick(list), o = threeFrom(list, it);
    return Math.random() < 0.5
      ? { q: 'What is it in Spanish?', pic: it[2], say: it[0], opts: o.map(x => ({ label: x[0] })), answer: o.indexOf(it), explain: `${it[2]} = ${it[0]} (${it[1]})` }
      : { q: `Which one is “${it[0]}”?`, sayPrompt: it[0], say: it[0], opts: o.map(x => ({ label: x[2], big: true })), answer: o.indexOf(it), explain: `${it[0]} = ${it[2]} ${it[1]}` }; };
  const numberQ = (lo, hi) => {
    const n = ri(lo, hi), wrong = shuffle([n + 1, n - 1, n + 10, n - 10, n + 2].filter(x => x >= lo - 2 && x <= hi && x !== n && x > 0)).slice(0, 2);
    const o = shuffle([n, ...wrong]);
    return Math.random() < 0.5
      ? { q: `What number is “${numEs(n)}”?`, sayPrompt: numEs(n), say: numEs(n), opts: o.map(x => ({ label: String(x) })), answer: o.indexOf(n), explain: `${numEs(n)} = ${n}` }
      : { q: `How do you say ${n} in Spanish?`, say: numEs(n), opts: o.map(x => ({ label: numEs(x) })), answer: o.indexOf(n), explain: `${n} = ${numEs(n)}` }; };

  // Counting by tens: wrong answers are other tens, never made-up numbers.
  // (Fraction questions above use fractions in simplest form, like 3/4 or 7/10.)
  const tensQ = () => {
    const n = 10 * ri(2, 10), o = shuffle([n, ...shuffle(Object.keys(TENS).map(Number).filter(x => x !== n)).slice(0, 2)]);
    return Math.random() < 0.5
      ? { q: `What number is “${TENS[n]}”?`, sayPrompt: TENS[n], say: TENS[n], opts: o.map(x => ({ label: String(x) })), answer: o.indexOf(n), explain: `${TENS[n]} = ${n}` }
      : { q: `How do you say ${n} in Spanish?`, say: TENS[n], opts: o.map(x => ({ label: TENS[x] })), answer: o.indexOf(n), explain: `${n} = ${TENS[n]}` }; };
  function spanishLevel(level) {
    if (level <= 7) return spanishQuestion(level <= 6);
    if (level === 8) return pick([() => numberQ(11, 20), () => numberQ(11, 20), () => meaningQ(DAYS), () => picQ(ES2.family), () => picQ(ES2.body), () => picQ(ES2.weather), () => spanishQuestion(false)])();
    if (level === 9) return pick([tensQ, () => meaningQ(MONTHS), () => sayItQ(MONTHS), () => picQ(ES2.school), () => picQ(ES2.verbs), () => meaningQ(ES2.verbs), () => meaningQ(OPPOSITES), () => sayItQ(DAYS)])();
    if (level === 10) return pick([() => meaningQ(PHRASES2), () => meaningQ(PHRASES2), () => picQ(ES2.clothes), () => numberQ(21, 99), () => numberQ(21, 99), () => sayItQ(OPPOSITES), () => sayItQ(ES2.family)])();
    return pick([() => meaningQ(SENTENCES), () => meaningQ(SENTENCES), () => meaningQ(QWORDS), () => meaningQ(CONJ), () => sayItQ(CONJ), () => sayItQ(PHRASES2)])();
  }


  // subject: 'math' or 'spanish'
  function makeQuestion(subject, level) {
    const q = subject === 'math' ? mathLevel(level) : spanishLevel(level);
    q.level = level; q.subject = subject;
    return q;
  }
  // Reads Spanish aloud (where the browser can)
  function sayEs(text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-MX'; u.rate = 0.8;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* no speech here */ }
  }
  window.BrainBank = { makeQuestion, sayEs };
})();
