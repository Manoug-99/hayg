const fs = require("fs");
const vm = require("vm");

const dataSource = fs.readFileSync("js/spelling-data.js", "utf8");
const gameSource = fs.readFileSync("js/spelling-game.js", "utf8");
const context = { window: {}, console, document: { addEventListener() {} } };
vm.createContext(context);
vm.runInContext(dataSource, context);
vm.runInContext(gameSource, context);

const sections = context.window.SPELLING_QUESTION_SECTIONS;
const categories = {
    "Բ թէ Փ": ["բ", "փ"], "Ո թէ Օ": ["ո", "օ"], "Դ թէ Թ": ["դ", "թ"],
    "Ե թէ Է": ["ե", "է"], "Ր թէ Ռ": ["ր", "ռ"], "Վ թէ Ւ": ["վ", "ւ"],
    "Ք թէ Գ": ["ք", "գ"], "Չ թէ Ջ": ["չ", "ջ"], "Հ թէ Յ": ["հ", "յ"],
    "Ձ թէ Ց": ["ձ", "ց"]
};
const normalizeCategory = category => {
    if (categories[category]) return category;
    const [first, second] = category.split(" թէ ");
    const reversedCategory = `${second} թէ ${first}`;
    return categories[reversedCategory] ? reversedCategory : category;
};
const questions = Object.entries(sections).flatMap(([category, entries]) =>
    entries.map((entry, index) => ({
        ...entry,
        id: `${category}-${index + 1}`,
        category: normalizeCategory(category)
    }))
);
const counts = context.window.validateSpellingQuestionBank(questions);
const stringIndexQuestions = questions.map(question => ({ ...question, index: String(question.index) }));
context.window.validateSpellingQuestionBank(stringIndexQuestions);
for (const question of questions) {
    const index = Number(question.index);
    const letters = categories[question.category];
    const choices = [question.word[index], letters.find(letter => letter !== question.word[index])];
    if (choices.length !== 2 || new Set(choices).size !== 2) {
        throw new Error(`Question ${question.id} does not produce exactly two distinct choices.`);
    }
    const restored = question.word.slice(0, index) + choices[0] + question.word.slice(index + 1);
    if (restored !== question.word) throw new Error(`Question ${question.id} does not reconstruct its answer.`);
    const displayed = question.word.slice(0, index) + "_" + question.word.slice(index + 1);
    if ((displayed.match(/_/g) || []).length !== 1) throw new Error(`Question ${question.id} must have exactly one blank.`);
}

console.log(`Validated ${questions.length} questions:`);
for (const [category, count] of Object.entries(counts)) console.log(`  ${category}: ${count}`);
