(function (root) {
    const designs = [
        ['dream', '夢的開始', '從一扇亮著燈的門開始，讓共同的日常有了歸處。', '#a9b7f5', 'special',
            '<path d="M60 8 98 32v54L60 112 22 86V32Z" fill="#30385c"/><path d="M60 17 90 36v46L60 103 30 82V36Z" fill="#161f38"/><path d="M43 86V47q17-22 34 0v39" fill="#bdc6ef"/><path d="M50 85V48q10-14 20 0v37" fill="#f6d58c"/><path d="m59 83-5 18 19-12" fill="#fff1bc" stroke="none"/><path d="M77 24a12 12 0 1 0 13 15 10 10 0 0 1-13-15Z" fill="#e5dcff"/><path d="m38 29 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff1bc"/><circle cx="66" cy="65" r="2" fill="#8b693d"/>'],
        ['receipt', '第一張收據', '一筆小小的紀錄，也值得留下。', '#b9d9cd', 'daily',
            '<path d="M32 15h56v89l-7-5-7 5-7-5-7 5-7-5-7 5-7-5-7 5Z" fill="#eee7d5"/><path d="M43 29h34M43 39h22M43 53h34M43 64h20M43 76h34" fill="none" stroke="#7b9690"/><circle cx="83" cy="84" r="17" fill="#57978c"/><path d="m74 84 6 6 11-12" fill="none" stroke="#eff8ee"/>'],
        ['breakfast', '早餐搭檔', '讓忙碌的一天，從一起吃早餐開始。', '#edbf83', 'daily',
            '<ellipse cx="57" cy="74" rx="45" ry="29" fill="#b6d8da"/><ellipse cx="57" cy="72" rx="35" ry="20" fill="#eef0dc"/><path d="M33 69V42q-9-11 4-18 19-10 35 0 13 7 4 18v27Z" fill="#d69a57"/><path d="M39 62V41q-7-8 3-12 15-7 25 0 10 4 3 12v21Z" fill="#f7db9b"/><path d="M62 61q8-13 21-5 12 8 3 17-6 9-18 3-12-2-6-15" fill="#fff8df"/><circle cx="76" cy="65" r="7" fill="#edb445"/>'],
        ['supplies', '補貨清單', '把缺少的補上，把生活照顧好。', '#accdb5', 'daily',
            '<path d="M25 43h70l-8 55H33Z" fill="#78aaa2"/><path d="m38 44 13-24m31 24L69 20" fill="none"/><path d="M41 59v25m19-25v25m19-25v25" stroke="#d9e9d6"/><path d="m46 16 31 4-5 42-31-4Z" fill="#eee8d3"/><path d="m50 29 4 4 7-7m-12 16 14 2" stroke="#739681" fill="none"/>'],
        ['laundry', '洗衣日', '衣物洗淨，日常也重新變得清爽。', '#aad5eb', 'daily',
            '<rect x="25" y="19" width="70" height="84" rx="10" fill="#c5d9df"/><path d="M25 40h70"/><rect x="34" y="27" width="21" height="6" rx="2" fill="#6f929b"/><circle cx="83" cy="30" r="4" fill="#f3d38b"/><circle cx="60" cy="70" r="25" fill="#739db0"/><circle cx="60" cy="70" r="19" fill="#203d54"/><path d="M43 72q9-8 17 0t17 0v8q-17 20-34 0Z" fill="#7ac4d6"/><circle cx="70" cy="58" r="4" fill="#d6eff3"/><circle cx="48" cy="63" r="2" fill="#d6eff3"/>'],
        ['fridge', '冰箱存糧', '有存糧的冰箱，是安心生活的小後盾。', '#b8d8b8', 'daily',
            '<rect x="30" y="12" width="60" height="95" rx="10" fill="#a8c7af"/><path d="M30 46h60M41 24v12m0 23v23" fill="none"/><path d="m62 21 18 3-3 15-18-3Z" fill="#fff0c9"/><path d="m65 28 8 2" stroke="#bc9765"/><path d="M54 66q6-7 13 0 8-7 12 2 4 18-13 26-16-8-12-28" fill="#e19a84"/><path d="m67 62 1-9q9-1 10 5" fill="#82a275"/>'],
        ['supper', '宵夜時光', '夜深了，留一份熱呼呼的陪伴。', '#e8ac8b', 'daily',
            '<path d="M17 55h86q-5 43-43 45-38-2-43-45Z" fill="#b76c60"/><ellipse cx="60" cy="55" rx="43" ry="13" fill="#f7d39d"/><path d="M30 53q14-9 26 0t25 0M34 59q14-9 26 0t25 0" fill="none" stroke="#d69a58"/><path d="m74 22 14 48m-4-50 14 46" stroke="#f2dec0"/><path d="M35 38q-9-8 0-16m20 16q-9-8 0-16" stroke="#f0ded0" fill="none"/>'],
        ['together', '日常同行', '同住一個屋簷，分享採買、宵夜與平凡日常。', '#a9cfd0', 'special',
            '<path d="M33 12h54l21 23v50l-21 23H33L12 85V35Z" fill="#355663"/><path d="M36 20h48l16 19v42l-16 19H36L20 81V39Z" fill="#203d49"/><rect x="38" y="28" width="44" height="33" rx="3" fill="#7cabb4"/><path d="M60 28v33M38 44h44" fill="none"/><path d="M28 68h25v17q-12 12-25 0Z" fill="#c4d9c5"/><path d="M67 68h25v17q-12 12-25 0Z" fill="#d7c5a3"/><path d="M28 73h-7v11h7m64-11h7v11h-7M26 95h68" fill="none"/><path d="M39 62q-4-5 0-10m40 10q-4-5 0-10" stroke="#dcebe3" fill="none"/>'],
        ['rain', '雨天留宿', '窗外下雨，屋裡有一盞等人的燈。', '#a8cadb', 'daily',
            '<path d="M23 101V44a37 37 0 0 1 74 0v57Z" fill="#58788e"/><path d="M31 93V44a29 29 0 0 1 58 0v49Z" fill="#1e3e57"/><path d="M60 17v76M31 54h58" fill="none"/><path d="m41 30-4 8m42 25-4 8m-32 4-4 8m40-43-4 8" stroke="#b5deeb"/><path d="M54 89h23l-5-17H59Z" fill="#edc486"/><path d="M65 89v12m-11 1h22" stroke="#e3c48d"/>'],
        ['desk', '整理書桌', '騰出一小塊空間，也整理一下心情。', '#c9bce5', 'daily',
            '<path d="M15 81h90v11H15Zm10 11v15m70-15v15" fill="#9e7b61"/><path d="M31 77V62h45v15Z" fill="#b0cdbd"/><path d="M36 61V48h43v13Z" fill="#d7adc2"/><path d="M29 47V34h43v13Z" fill="#e6d5a5"/><path d="M88 78V38L73 25" fill="none"/><path d="m57 33 16-19 18 19Z" fill="#b4a3d0"/><path d="M79 78h19" fill="none"/>'],
        ['accounts', '月底對帳', '每一筆都有著落，月底就能輕鬆一點。', '#c9d5ba', 'daily',
            '<path d="M16 24q23-7 44 3 21-10 44-3v70q-23-7-44 3-21-10-44-3Z" fill="#e9e3ce"/><path d="M60 27v70M27 40h22M27 52h22M27 64h16" fill="none" stroke="#94a399"/><rect x="67" y="43" width="27" height="43" rx="4" fill="#658f85"/><rect x="72" y="49" width="17" height="9" rx="1" fill="#b9d8c4"/><path d="M73 66h3m7 0h3m-13 9h3m7 0h3" stroke="#edf0dc"/>'],
        ['season', '本季紀念章', '第一季的共同日常，收藏在這扇窗裡。', '#efd397', 'special',
            '<path d="m28 85-7 29 21-9 12 10 7-24m31-6 7 29-21-9-12 10-7-24" fill="#708b96"/><path d="m60 5 12 8 14 1 5 13 12 9-3 14 5 14-10 10-3 14-14 4-10 10-13-5-14 3-9-12-13-5-1-14-8-12 8-12 1-14 13-5 9-12 14 3Z" fill="#bd9557"/><circle cx="60" cy="55" r="36" fill="#183e49"/><path d="M40 75V43l20-16 20 16v32Z" fill="#759ca6"/><path d="M48 68V47h24v21Z" fill="#f4d99c"/><path d="M60 47v21m-12-10h24" stroke="#856a47"/><path d="M38 84h44" fill="none"/><text x="60" y="98" text-anchor="middle" font-size="11" font-family="serif" fill="#fff1c6" stroke="none">I</text>'],
    ];
    const catalog = root.SplitCosmetics.catalog;
    for (const [key, name, desc, accent, tier, shape] of designs) {
        const id = `badge_${key}`;
        catalog[id] = { id, name, desc, accent, tier, type: 'badge', family: 'badge', bg: '#20292e', shape };
    }
})(globalThis);
