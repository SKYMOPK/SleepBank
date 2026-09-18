(function (root) {
    // Set a confirmed startAt and reward list before enabling a season.
    root.SplitPassConfig = Object.freeze({
        seasons: [{ id: 'season-01', name: '宿舍日常 · 第一季', enabled: true, startAt: 1789588800000, rewards: {
            1: 'badge_dream', 3: 'badge_receipt', 5: 'star_color', 7: 'badge_breakfast',
            9: 'badge_supplies', 10: 'cat_color', 12: 'badge_laundry', 14: 'badge_fridge',
            15: 'matcha_color', 17: 'badge_supper', 19: 'badge_together', 20: 'thunder_color',
            23: 'badge_rain', 25: 'matcha_effect', 27: 'badge_desk', 30: 'thunder_effect',
            33: 'badge_accounts', 35: 'rain_color', 38: 'badge_season', 40: ['dorm_color', 'homecoming_effect'],
        } }],
        levels: 40,
        xpPerLevel: 40,
        dailyCap: 200,
        durationDays: 45,
    });
})(globalThis);
