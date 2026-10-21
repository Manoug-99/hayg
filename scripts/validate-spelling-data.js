const fs = require("fs");
const vm = require("vm");

const dataSource = fs.readFileSync("js/spelling-data.js", "utf8");
const gameSource = fs.readFileSync("js/spelling-game.js", "utf8");
const context = { window: {}, console, document: { addEventListener() {} } };
vm.createContext(context);
vm.runInContext(dataSource, context);
vm.runInContext(gameSource, context);

const sections = context.window.SPELLING_QUESTION_SECTIONS;
const questions = Object.entries(sections).flatMap(([category, entries]) =>
    entries.map((entry, index) => ({ ...entry, id: `${category}-${index + 1}`, category }))
);
const counts = context.window.validateSpellingQuestionBank(questions);
for (const question of questions) {
    const letters = {
        "Բ թէ Փ": ["բ", "փ"], "Ո թէ Օ": ["ո", "օ"], "Դ թէ Թ": ["դ", "թ"],
        "Ե թէ Է": ["ե", "է"], "Ր թէ Ռ": ["ր", "ռ"], "Վ թէ Ւ": ["վ", "ւ"],
        "Ք թէ Գ": ["ք", "գ"], "Չ թէ Ջ": ["չ", "ջ"], "Հ թէ Յ": ["հ", "յ"],
        "Ձ թէ Ց": ["ձ", "ց"]
    }[question.category];
    const choices = [question.word[question.index], letters.find(letter => letter !== question.word[question.index])];
    if (choices.length !== 2 || new Set(choices).size !== 2) {
        throw new Error(`Question ${question.id} does not produce exactly two distinct choices.`);
    }
    const restored = question.word.slice(0, question.index) + choices[0] + question.word.slice(question.index + 1);
    if (restored !== question.word) throw new Error(`Question ${question.id} does not reconstruct its answer.`);
    const displayed = question.word.slice(0, question.index) + "_" + question.word.slice(question.index + 1);
    if ((displayed.match(/_/g) || []).length !== 1) throw new Error(`Question ${question.id} must have exactly one blank.`);
}

console.log(`Validated ${questions.length} questions:`);
for (const [category, count] of Object.entries(counts)) console.log(`  ${category}: ${count}`);
