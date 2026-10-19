(function () {
  'use strict';

  const TX = window.TX = window.TX || {};
  const assets = TX.demoAssets || {};
  const interval = assets.interval || '';
  const median = assets.median || '';

  const project = {
    version: 2,
    meta: {
      conference: 'The 2026 ICPC Asia Regional Contest Tutorials',
      coverKicker: 'CONTEST TUTORIALS',
      title: '2026 区域赛\n竞赛题解',
      subtitle: '从核心观察到完整实现',
      authors: '题解组',
      organizer: 'Problem Setting Group',
      logo: '',
      accent: '#1f5f8f',
      showDots: true,
      footerNote: ''
    },
    problems: [
      {
        id: 'demo-problem-a',
        code: 'A',
        name: '区间合并',
        statement: '给定 $n$ 个闭区间 $[l_i,r_i]$。请合并所有相交或相接的区间，并按左端点递增的顺序输出。',
        constraints: '$1 \\le n \\le 2\\times 10^5$，$|l_i|,|r_i|\\le 10^9$。',
        ideaBy: '出题组',
        preparedBy: '出题组',
        attempted: '312',
        solved: '286',
        firstBlood: 'demo_team @ 12 min',
        difficulty: 'Basic',
        judgeSolution: '685 Bytes',
        tags: '排序 · 贪心'
      },
      {
        id: 'demo-problem-b',
        code: 'B',
        name: '带权中位数',
        statement: '数轴上有 $n$ 个点，第 $i$ 个点位于 $x_i$，权重为 $w_i$。选择一个位置 $x$，最小化\n$$F(x)=\\sum_{i=1}^{n} w_i\\,|x_i-x|.$$\n输出最小的 $F(x)$。',
        constraints: '$1\\le n\\le 2\\times 10^5$，$1\\le w_i\\le 10^9$，$|x_i|\\le 10^9$。',
        ideaBy: '出题组',
        preparedBy: '出题组',
        attempted: '198',
        solved: '121',
        firstBlood: 'demo_team @ 41 min',
        difficulty: 'Medium',
        judgeSolution: '742 Bytes',
        tags: '中位数 · 前缀和'
      }
    ],
    pages: [
      { id: 'demo-cover', type: 'cover' },
      {
        id: 'demo-agenda',
        type: 'agenda',
        kicker: 'CONTEST OVERVIEW',
        title: '题目一览',
        intro: '本场题解按题目顺序编排。每道题先给出题意与比赛数据，再展开核心观察、正确性证明和实现细节。'
      },
      { id: 'demo-problem-a-page', type: 'problem', problemId: 'demo-problem-a' },
      {
        id: 'demo-a-1',
        type: 'solution',
        problemId: 'demo-problem-a',
        kicker: 'SOLUTION',
        title: '核心观察',
        layout: 'split',
        left: '将所有区间按左端点排序。扫描到 $[l,r]$ 时，只需要和已经合并的最后一个区间 $[L,R]$ 比较。\n\n若 $l>R$，说明中间出现<span class="c-red">空隙</span>，当前区间开启新的一段；否则两段相交或相接，合并为 $[L,\\max(R,r)]$。',
        right: '**为什么只检查最后一个区间？**\n\n排序后，已合并区间的右端点 $R$ 就是当前所有区间能延伸到的**最右位置**。更早的区间不可能跨过 $R$ 继续向右延伸。\n\n因此，只要当前区间与最后一个区间不相交，它和之前所有区间都不相交。核心就是：**排序 + 一次扫描**。',
        complexity: '排序 $O(n\\log n)$，扫描 $O(n)$；总时间复杂度 $O(n\\log n)$，空间复杂度 $O(n)$。',
        imageId: '',
        imageCaption: ''
      },
      {
        id: 'demo-a-2',
        type: 'solution',
        problemId: 'demo-problem-a',
        kicker: 'SOLUTION',
        title: '扫描与切分',
        layout: 'visual',
        left: '维护当前合并段 $[L,R]$，从左到右处理区间：\n\n1. 若 $l>R$，输出 $[L,R]$，并把当前区间设为新的合并段。\n2. 否则令 $R\\leftarrow\\max(R,r)$。\n\n最后不要忘记输出仍在维护的最后一段。若结果为空，直接加入第一个区间即可。',
        right: '',
        complexity: '扫描是线性的，瓶颈在排序：$O(n\\log n)$。',
        imageId: 'demo-asset-interval',
        imageCaption: '图 1：按左端点排序后扫描，空隙出现时切分合并段。'
      },
      {
        id: 'demo-a-3',
        type: 'solution',
        problemId: 'demo-problem-a',
        kicker: 'IMPLEMENTATION',
        title: '实现细节',
        layout: 'single',
        left: '```cpp\nsort(seg.begin(), seg.end());\nvector<pair<int, int>> ans;\nfor (auto [l, r] : seg) {\n    if (ans.empty() || l > ans.back().second) {\n        ans.push_back({l, r});\n    } else {\n        ans.back().second = max(ans.back().second, r);\n    }\n}\n```\n\n注意这里用 `l > R` 判断是否出现空隙，因此**相接的区间也会合并**。如果题目改成半开区间 $[l,r)$，判断条件要相应调整。',
        right: '',
        complexity: '时间复杂度 $O(n\\log n)$，空间复杂度 $O(n)$。',
        imageId: '',
        imageCaption: ''
      },
      { id: 'demo-problem-b-page', type: 'problem', problemId: 'demo-problem-b' },
      {
        id: 'demo-b-1',
        type: 'solution',
        problemId: 'demo-problem-b',
        kicker: 'SOLUTION',
        title: '加权中位数',
        layout: 'visual',
        left: '把每个位置 $x_i$ 看成 $w_i$ 个重合的点，问题就等价于在数轴上选一个位置，使所有点的距离和最小。\n\n设总权重 $W=\\sum w_i$。最优位置 $x$ 必须让左右两侧的权重都不超过 $W/2$：\n$$\n\\sum_{x_i<x} w_i \\le \\frac W2,\\qquad \\sum_{x_i>x} w_i \\le \\frac W2.\n$$\n取排序后的**加权中位数**即可。',
        right: '',
        complexity: '排序 $O(n\\log n)$，寻找中位数 $O(n)$。',
        imageId: 'demo-asset-median',
        imageCaption: '图 2：总权重为 8 时，位置 5 让左右权重分别为 6 和 2；它就是加权中位数。'
      },
      {
        id: 'demo-b-2',
        type: 'solution',
        problemId: 'demo-problem-b',
        kicker: 'SOLUTION',
        title: '计算答案',
        layout: 'split',
        left: '选定 $x$ 后，把绝对值拆开：\n$$\nF(x)=\\sum_{x_i\\le x}w_i(x-x_i)+\\sum_{x_i>x}w_i(x_i-x).\n$$\n用前缀和预处理 $\\sum w_i$ 与 $\\sum w_i x_i$，即可在 $O(1)$ 内计算 $F(x)$。',
        right: '**实现顺序**\n\n1. 按 $x_i$ 排序，预处理权重的前缀和与加权坐标的前缀和。\n2. 找到第一个使前缀权重 $\\ge \\lceil W/2\\rceil$ 的位置。\n3. 代入公式计算答案，使用 64 位整数。\n\n注意 $w_i$ 和坐标都可能很大，答案需要用 `long long`。',
        complexity: '总时间复杂度 $O(n\\log n)$，空间复杂度 $O(n)$。',
        imageId: '',
        imageCaption: ''
      },
      {
        id: 'demo-thanks',
        type: 'thanks',
        kicker: 'ACKNOWLEDGEMENTS',
        title: '致谢',
        intro: '一场比赛从题目构思到最终榜单，离不开许多人的投入。',
        thanks: {
          setters: 'Problem Setting Group\n题面、数据与标程',
          testers: '验题组\n交叉验题与难度评估',
          volunteers: '赛事志愿者\n现场与线上支持',
          contestants: '所有参赛选手\n感谢你们带来的精彩比赛',
          coaches: '各校教练与带队老师\n感谢长期以来的指导与陪伴'
        },
        outro: '谢谢每一位让这场比赛发生的人。'
      },
      {
        id: 'demo-closing',
        type: 'closing',
        kicker: 'CLOSING',
        title: '写在最后',
        body: '无论你处在竞赛的哪个阶段，没有发挥出理想成绩都是一件自然的事。\n\n一次比赛的结果，不能定义你走过的路，也不能预支你未来的上限。把它当作一次反馈，而不是一次判决。复盘、休息、再出发。\n\n愿你始终保留对算法的好奇，也记得在赛场之外照顾好自己。',
        signoff: '题解组'
      }
    ],
    assets: [
      {
        id: 'demo-asset-interval',
        name: '区间合并示意图.png',
        data: interval,
        width: 1200,
        height: 820,
        bytes: interval.length
      },
      {
        id: 'demo-asset-median',
        name: '加权中位数示意图.png',
        data: median,
        width: 1200,
        height: 820,
        bytes: median.length
      }
    ]
  };

  TX.demoProject = () => JSON.parse(JSON.stringify(project));
})();

