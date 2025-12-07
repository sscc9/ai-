
const detectDeath = (content) => {
    const deadIds = [];

    // Simulate the current implementation
    if (content.includes("死亡") || content.includes("倒牌")) {
        // Current Regex: Only matches if followed by "号"
        const numberMatches = content.match(/(\d+)号/g);
        if (numberMatches) {
            numberMatches.forEach(m => {
                const id = parseInt(m.replace('号', ''));
                deadIds.push(id);
            });
        }
    }

    return [...new Set(deadIds)];
};

const problematicStrings = [
    "3、6号倒牌",
    "3,6号倒牌",
    "3号、6号倒牌",
    "3和6号倒牌"
];

problematicStrings.forEach(s => {
    console.log(`"${s}" =>`, detectDeath(s));
});
