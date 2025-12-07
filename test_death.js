
const detectDeath = (content) => {
    const deadIds = [];
    const singlePatterns = [
        /(\d+)号\s*被投票出局/,
        /猎人开枪.*(\d+)号\s*倒牌/,
        /毒死了\s*(\d+)号/
    ];

    singlePatterns.forEach(p => {
        const match = content.match(p);
        if (match && match[1]) deadIds.push(parseInt(match[1]));
    });

    if (content.includes("死亡") || content.includes("倒牌")) {
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

const testCases = [
    "今晚倒牌3号，6号",
    "昨晚倒牌的是3号和6号",
    "3号死亡，6号死亡",
    "3号、6号倒牌",
    "昨晚3号倒牌，6号吃毒",
    "3号被投票出局",
    "猎人开枪带走6号倒牌",
    "女巫毒死了6号",
    // Calculated misses
    "昨晚3、6倒牌", // Missing '号'
    "3和6号死亡"   // 3 missing '号'
];

testCases.forEach(c => {
    console.log(`"${c}" =>`, detectDeath(c));
});
