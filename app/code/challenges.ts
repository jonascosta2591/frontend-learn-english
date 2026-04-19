export interface Challenge {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  bugDescription: string;
  expectedBehavior: string;
  buggyCode: string;       // the broken function the user must fix
  functionName: string;    // name of the function to replace
  uiType: "search" | "counter" | "todo" | "cart" | "form";
  testCases: { input: unknown; expected: unknown; label: string }[];
}

export const challenges: Challenge[] = [
  {
    id: "search-filter",
    title: "Search Filter Bug",
    difficulty: "easy",
    bugDescription: "The search filter is not working. It should filter items by name (case-insensitive), but it always returns all items.",
    expectedBehavior: "filterItems(items, query) should return only items whose name includes the query string (case-insensitive).",
    functionName: "filterItems",
    uiType: "search",
    buggyCode: `function filterItems(items, query) {
  // BUG: wrong comparison — always returns all items
  return items.filter(item => item.name === query);
}`,
    testCases: [
      { input: [[ {name:"Apple"},{name:"Banana"},{name:"Apricot"} ], "ap"], expected: [{name:"Apple"},{name:"Apricot"}], label: 'filterItems([...], "ap") → Apple, Apricot' },
      { input: [[ {name:"React"},{name:"Vue"},{name:"Angular"} ], ""], expected: [{name:"React"},{name:"Vue"},{name:"Angular"}], label: 'filterItems([...], "") → all items' },
      { input: [[ {name:"Dog"},{name:"Cat"} ], "xyz"], expected: [], label: 'filterItems([...], "xyz") → []' },
    ],
  },
  {
    id: "counter-increment",
    title: "Counter Increment Bug",
    difficulty: "easy",
    bugDescription: "The counter increment function is broken. Clicking '+' should add 1 to the count, but it multiplies by 2 instead.",
    expectedBehavior: "increment(count) should return count + 1.",
    functionName: "increment",
    uiType: "counter",
    buggyCode: `function increment(count) {
  // BUG: multiplies instead of adding
  return count * 2;
}`,
    testCases: [
      { input: [0], expected: 1, label: "increment(0) → 1" },
      { input: [5], expected: 6, label: "increment(5) → 6" },
      { input: [99], expected: 100, label: "increment(99) → 100" },
    ],
  },
  {
    id: "todo-toggle",
    title: "Todo Toggle Bug",
    difficulty: "medium",
    bugDescription: "Toggling a todo item marks ALL items as done instead of only the clicked one.",
    expectedBehavior: "toggleTodo(todos, id) should flip the 'done' property only of the item with the matching id.",
    functionName: "toggleTodo",
    uiType: "todo",
    buggyCode: `function toggleTodo(todos, id) {
  // BUG: toggles all items instead of just the one with matching id
  return todos.map(todo => ({ ...todo, done: !todo.done }));
}`,
    testCases: [
      {
        input: [[{id:1,text:"Buy milk",done:false},{id:2,text:"Walk dog",done:false}], 1],
        expected: [{id:1,text:"Buy milk",done:true},{id:2,text:"Walk dog",done:false}],
        label: "toggleTodo([...], 1) → only item 1 toggled"
      },
      {
        input: [[{id:1,text:"Buy milk",done:true},{id:2,text:"Walk dog",done:false}], 2],
        expected: [{id:1,text:"Buy milk",done:true},{id:2,text:"Walk dog",done:true}],
        label: "toggleTodo([...], 2) → only item 2 toggled"
      },
    ],
  },
  {
    id: "cart-total",
    title: "Cart Total Bug",
    difficulty: "medium",
    bugDescription: "The cart total calculation is wrong. It should sum price × quantity for each item, but it only sums the prices.",
    expectedBehavior: "calcTotal(items) should return the sum of item.price * item.qty for all items.",
    functionName: "calcTotal",
    uiType: "cart",
    buggyCode: `function calcTotal(items) {
  // BUG: ignores quantity
  return items.reduce((sum, item) => sum + item.price, 0);
}`,
    testCases: [
      { input: [[{name:"Apple",price:1.5,qty:3},{name:"Bread",price:2,qty:1}]], expected: 6.5, label: "calcTotal([Apple×3, Bread×1]) → 6.5" },
      { input: [[{name:"Pen",price:0.5,qty:10}]], expected: 5, label: "calcTotal([Pen×10]) → 5" },
      { input: [[]], expected: 0, label: "calcTotal([]) → 0" },
    ],
  },
  {
    id: "form-validate",
    title: "Form Validation Bug",
    difficulty: "hard",
    bugDescription: "The email validation always returns true even for invalid emails. It should validate that the string contains '@' and a '.' after the '@'.",
    expectedBehavior: "isValidEmail(email) should return true only if the email contains '@' and has a '.' somewhere after the '@'.",
    functionName: "isValidEmail",
    uiType: "form",
    buggyCode: `function isValidEmail(email) {
  // BUG: always returns true
  return true;
}`,
    testCases: [
      { input: ["user@example.com"], expected: true, label: "isValidEmail('user@example.com') → true" },
      { input: ["notanemail"], expected: false, label: "isValidEmail('notanemail') → false" },
      { input: ["missing@dot"], expected: false, label: "isValidEmail('missing@dot') → false" },
      { input: ["@nodomain.com"], expected: false, label: "isValidEmail('@nodomain.com') → false" },
    ],
  },
];
