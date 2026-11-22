import { parseAst } from 'vite';

const property = node => node?.type === 'Literal' ? node.value : node?.name;
const member = node => node?.type === 'MemberExpression' ? property(node.property) : undefined;
const wireName = value => typeof value === 'string' && /^lt(?:41)?-/.test(value);
const tables = new Set(['MSG', 'LT41_MSG', 'FRAME_MESSAGE_TYPES']);
function stringValue(node) {
  if (node?.type === 'Literal') return node.value;
  if (node?.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
}

function childNodes(node) {
  return Object.values(node).flat().filter(child => child && typeof child.type === 'string');
}

function isDomValue(parent) {
  const callee = parent?.callee;
  const method = member(callee) ?? callee?.name;
  if (member(callee?.object) === 'classList') return true;
  if (['CustomEvent', 'Event', 'addEventListener', 'removeEventListener', 'getElementById',
    'querySelector', 'querySelectorAll', 'closest', 'matches', 'getAttribute', 'setAttribute',
    'getItem', 'setItem', 'removeItem'].includes(method)) return true;
  return ['className', 'id', 'textContent'].includes(member(parent?.left));
}

// 문서의 스크립트를 구문 단위로 읽어 보내는 이름과 message 리스너에서 실제로 고르는 이름을 나눈다.
export function messageUsage(source, tableNames = new Set()) {
  const received = new Set(), keys = new Set(), literals = new Set(), definitions = new Set();
  const helpers = new Set(['send', 'post', 'emit', 'notifyParent', 'sendToFrame', 'frameMessage', 'postMessage']);
  const program = parseAst(source);
  function findHelpers(node, owner) {
    if (node.type === 'FunctionDeclaration') owner = node.id?.name;
    if (node.type === 'VariableDeclarator' && node.init?.type?.endsWith('FunctionExpression')) owner = node.id.name;
    if (owner && node.type === 'CallExpression' && member(node.callee) === 'postMessage') helpers.add(owner);
    for (const child of childNodes(node)) findHelpers(child, owner);
  }
  findHelpers(program);

  function walk(node, aliases, receiving = false, parent = null) {
    if (node.type === 'Program' || node.type === 'BlockStatement') {
      aliases = new Map(aliases);
      for (const statement of node.body) {
        if (statement.type === 'FunctionDeclaration') aliases.set(statement.id.name, statement);
        for (const binding of statement.declarations ?? []) aliases.set(binding.id.name, binding.init);
        for (const binding of statement.specifiers ?? []) {
          if (binding.imported?.name === 'MSG') aliases.set(binding.local.name, binding.imported);
        }
      }
    }
    function resolve(expr) {
      const seen = new Set();
      while (expr?.type === 'Identifier' && aliases.get(expr.name) && !seen.has(expr.name)) {
        seen.add(expr.name);
        expr = aliases.get(expr.name);
      }
      return expr?.type === 'ChainExpression' ? expr.expression : expr;
    }
    const isType = expr => expr?.name === 'type' || member(resolve(expr)) === 'type';
    const isEventType = expr => member(resolve(resolve(expr)?.object)) === 'data';
    function readName(expr, receiver, direct = false) {
      const value = resolve(expr);
      if (!value) return;
      const literal = stringValue(value);
      if (wireName(literal) || (direct && typeof literal === 'string')) literals.add(literal);
      const table = resolve(value.object);
      if (tables.has(table?.name) || tables.has(member(table))) {
        const key = member(value);
        keys.add(key);
        if (receiver) received.add(key);
      }
    }
    const value = stringValue(node);
    if (tableNames.has(value) && !isDomValue(parent)) definitions.add(value);
    if (node.type === 'MemberExpression') readName(node, false);
    if (node.type === 'Property' && property(node.key) === 'type') readName(node.value, false);
    if (node.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(node.operator)) {
      if (isType(node.left)) readName(node.right, receiving, receiving && isEventType(node.left));
      if (isType(node.right)) readName(node.left, receiving, receiving && isEventType(node.right));
    }
    if (node.type === 'SwitchStatement' && isType(node.discriminant)) {
      for (const branch of node.cases) readName(branch.test, receiving, receiving && isEventType(node.discriminant));
    }
    if (node.type === 'AssignmentExpression' && member(node.left) === 'onmessage') {
      walk(resolve(node.right), aliases, true, node);
      return;
    }
    if (node.type === 'CallExpression') {
      const method = member(node.callee) ?? node.callee.name;
      const [arg, handler] = node.arguments;
      if (method === 'addEventListener' && stringValue(arg) === 'message' && handler) {
        walk(resolve(handler), aliases, true, node);
        return;
      }
      if (method === 'includes' && isType(arg)) {
        for (const item of resolve(node.callee.object)?.elements ?? []) readName(item, receiving);
      }
      if (helpers.has(method)) {
        for (const parameter of node.arguments) {
          const object = resolve(parameter);
          if (object?.type === 'ObjectExpression') {
            const type = object.properties.find(field => property(field.key) === 'type');
            readName(type?.value, false, method === 'postMessage');
          } else readName(parameter, false);
        }
      }
    }
    for (const child of childNodes(node)) walk(child, aliases, receiving, node);
  }
  walk(program, new Map());
  return { received, keys, literals, definitions };
}
