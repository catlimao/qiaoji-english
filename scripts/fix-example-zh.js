/**
 * 离线修复样例词书伪翻译。用法：node scripts/fix-example-zh.js
 */
const fs = require("fs");
const path = require("path");

const FAKE_RE = /这句话展示了|表示「.*」的用法/;

const ZH = {
  "They had to abandon the sinking ship.": "他们不得不放弃那艘正在下沉的船。",
  "She has the ability to learn quickly.": "她具备快速学习的能力。",
  "He studied abroad for two years.": "他在国外学习了两年。",
  "I have absolute confidence in her.": "我对她有绝对的信心。",
  "Plants absorb water from the soil.": "植物从土壤中吸收水分。",
  "Beauty is an abstract concept.": "美是一个抽象的概念。",
  "The region has abundant natural resources.": "该地区拥有丰富的自然资源。",
  "The report exposed the abuse of power.": "这份报告揭露了权力滥用。",
  "She pursued an academic career.": "她追求学术生涯。",
  "The car began to accelerate.": "汽车开始加速。",
  "He speaks English with a French accent.": "他说英语带有法国口音。",
  "Please accept my apology.": "请接受我的道歉。",
  "Students have free access to the library.": "学生可以免费使用图书馆。",
  "He was injured in a traffic accident.": "他在一场交通事故中受伤。",
  "The hotel can accommodate 200 guests.": "这家酒店可容纳200位客人。",
  "May I accompany you to the station?": "我可以陪你去车站吗？",
  "We accomplished the task ahead of time.": "我们提前完成了任务。",
  "She opened a bank account yesterday.": "她昨天开了一个银行账户。",
  "Dust can accumulate if you never clean.": "如果你从不打扫，灰尘就会积聚。",
  "The report gives an accurate description.": "这份报告给出了准确的描述。",
  "They accuse him of lying.": "他们指责他撒谎。",
  "She worked hard to achieve her goals.": "她努力工作以实现自己的目标。",
  "Lemon juice contains citric acid.": "柠檬汁含有柠檬酸。",
  "He refused to acknowledge his mistake.": "他拒绝承认自己的错误。",
  "She acquired a taste for classical music.": "她逐渐喜欢上了古典音乐。",
  "There is a bridge across the river.": "河上有一座桥。",
  "Think carefully before you act.": "行动之前请仔细思考。",
  "It takes time to adapt to a new culture.": "适应一种新文化需要时间。",
  "He is a coffee addict.": "他是个咖啡成瘾者。",
  "In addition, we need more time.": "此外，我们还需要更多时间。",
  "The food supply is adequate for winter.": "食物供应足够过冬。",
  "Please adjust the volume.": "请调节音量。",
  "I admire her courage.": "我钦佩她的勇气。",
  "He admitted that he was wrong.": "他承认自己错了。",
  "They decided to adopt a child.": "他们决定收养一个孩子。",
  "This movie is for adults only.": "这部电影仅限成年人观看。",
  "Technology continues to advance.": "技术不断进步。",
  "Her height gives her an advantage.": "她的身高给她带来优势。",
  "They set out on an adventure.": "他们踏上了一次冒险。",
  "They advertise the product on TV.": "他们在电视上为这个产品做广告。",
  "Can you give me some advice?": "你能给我一些建议吗？",
  "The scandal became a public affair.": "这桩丑闻成了公众事件。",
  "The weather can affect your mood.": "天气会影响你的情绪。",
  "I cannot afford a new car.": "我买不起新车。",
  "She is afraid of spiders.": "她害怕蜘蛛。",
  "He works for a travel agency.": "他在一家旅行社工作。",
  "What is on the agenda today?": "今天的议程上有什么？",
  "She is a real estate agent.": "她是一名房地产经纪人。",
  "The dog became aggressive.": "那只狗变得具有攻击性。",
  "I agree with your opinion.": "我同意你的观点。",
  "Agriculture is vital to the economy.": "农业对经济至关重要。",
  "There is a long journey ahead.": "前方还有很长的路。",
  "They received financial aid.": "他们得到了经济援助。",
  "His aim is to become a doctor.": "他的目标是成为一名医生。",
  "The alarm went off at six.": "闹钟在六点响了。",
  "She released a new album.": "她发行了一张新专辑。",
  "Do not drink alcohol and drive.": "不要酒后驾车。",
  "Stay alert while crossing the street.": "过马路时请保持警觉。",
  "The twins look alike.": "这对双胞胎长得很像。",
  "The tradition is still alive.": "这个传统仍然保留着活力。",
  "They voted to abolish the old law.": "他们投票废除了旧法律。",
  "The meeting came to an abrupt end.": "会议突然结束了。",
  "The idea sounds absurd.": "这个想法听起来很荒谬。",
  "There is an abundance of choices.": "选择非常丰富。",
  "The bag is a popular accessory.": "这个包是一款很受欢迎的配件。",
  "They reached an accord after talks.": "经过谈判后，他们达成了协议。",
  "Let me acquaint you with the rules.": "让我向你介绍一下这些规定。",
  "Click here to activate your account.": "点击这里激活你的账户。",
  "She felt acute pain in her knee.": "她感到膝盖一阵剧痛。",
  "Please adhere to the guidelines.": "请遵守这些指导方针。",
  "The park is adjacent to the school.": "公园紧挨着学校。",
  "Nurses administer medicine carefully.": "护士会仔细地用药。",
  "The book is written for adolescents.": "这本书是为青少年写的。",
  "Smoking has adverse effects on health.": "吸烟对健康有不利影响。",
  "She is an advocate for equal rights.": "她是平等权利的倡导者。",
  "The design has aesthetic appeal.": "这个设计具有美学吸引力。",
  "The college is an affiliate of the university.": "这所学院隶属于该大学。",
  "I affirm that the statement is true.": "我断言这个说法是真实的。",
  "Poverty continues to afflict many families.": "贫困继续折磨着许多家庭。",
  "They live in an affluent neighborhood.": "他们住在富裕的社区。",
  "Scratching will aggravate the itch.": "抓挠会加重痒感。",
  "The aggregate score was impressive.": "总分非常可观。",
  "The news began to agitate the crowd.": "这则消息开始煽动人群。",
  "The weather was agreeable.": "天气宜人。",
  "The plane was airborne within minutes.": "飞机几分钟内就起飞升空了。",
  "Please keep the aisle clear.": "请保持过道通畅。",
  "The landscape looked alien to him.": "这片风景对他来说很陌生。",
  "They allege that he stole the money.": "他们声称他偷了钱。",
  "Medicine can alleviate the pain.": "药物可以减轻疼痛。",
  "We must allocate resources carefully.": "我们必须仔细分配资源。",
  "The teacher will allot time for questions.": "老师会安排时间提问。",
  "Steel is an alloy of iron and carbon.": "钢是铁和碳的合金。",
  "Canada is a close ally of the United States.": "加拿大是美国的亲密盟友。",
  "We work on alternate days.": "我们隔天工作。",
  "His answer was ambiguous.": "他的回答模棱两可。",
  "Her ambition is to become a scientist.": "她的抱负是成为一名科学家。",
  "They agreed to amend the contract.": "他们同意修改合同。",
  "He is an amiable colleague.": "他是一位和蔼可亲的同事。",
  "She smiled amid the chaos.": "她在一片混乱中微笑着。",
  "The soldiers ran out of ammunition.": "士兵们弹药耗尽了。",
  "The microphone will amplify her voice.": "麦克风会放大她的声音。",
  "He explained gravity with an analogy.": "他用类比解释了重力。",
  "The analyst predicted market growth.": "分析师预测市场会增长。",
  "My ancestors came from Europe.": "我的祖先来自欧洲。",
  "The ship dropped its anchor.": "船抛下了锚。",
  "He told a funny anecdote.": "他讲了一件有趣的轶事。",
  "She was like an angel to the children.": "对孩子们来说，她就像天使一样。",
  "Today is their wedding anniversary.": "今天是他们的结婚纪念日。",
  "The donation was anonymous.": "这笔捐款是匿名的。",
  "The antagonist appears in chapter two.": "反派在第二章出场。",
  "We anticipate a busy season.": "我们预计将迎来忙碌的一季。",
  "She collects antique furniture.": "她收藏古董家具。",
  "He suffered from test anxiety.": "他患有考试焦虑。",
  "Please accept my apology.": "请接受我的道歉。",
  "The laboratory bought new apparatus.": "实验室购置了新器械。",
  "The charity made an appeal for help.": "该慈善机构发出了求助呼吁。",
  "Exercise can increase your appetite.": "运动可以增进食欲。",
  "His aberrant behavior worried friends.": "他的异常行为让朋友们担忧。",
  "You must abide by the rules.": "你必须遵守规则。",
  "The absorption of nutrients is vital.": "营养的吸收至关重要。",
  "The museum is accessible by subway.": "博物馆乘坐地铁即可到达。",
  "He was named as an accomplice.": "他被指认为同谋。",
  "She denied the accusation.": "她否认了这项指控。",
  "It takes time to accustom yourself to change.": "让自己习惯变化需要时间。",
  "He is only a casual acquaintance.": "他只是个泛泛之交。",
  "Language acquisition starts early.": "语言习得开始得很早。",
  "Adaptability is key in this job.": "适应性是这份工作的关键。",
  "Smartphone addiction is common.": "智能手机成瘾很常见。",
  "She is adept at solving puzzles.": "她擅长解谜。",
  "Grammar is an adjunct to meaning.": "语法是意义的附属物。",
  "His honesty is admirable.": "他的诚实令人钦佩。",
  "Admission to the park is free.": "公园免费入场。",
  "The adoption of new technology takes time.": "新技术的采用需要时间。",
  "The children adore their teacher.": "孩子们很崇拜他们的老师。",
  "Flowers adorn the hall.": "鲜花装点着大厅。",
  "The deal is advantageous for both sides.": "这笔交易对双方都有利。",
  "He faced a strong adversary.": "他面对的是一个强大的对手。",
  "She showed great affection for her pets.": "她对宠物表现出深厚的感情。",
  "They helped rebuild in the aftermath.": "他们在事后参与了重建。",
  "Cats are remarkably agile.": "猫非常敏捷。",
  "Do not agonize over every detail.": "不要为每个细节痛苦纠结。",
  "The doctor treated a minor ailment.": "医生治疗了一处小病。",
  "The room felt bright and airy.": "房间明亮又通风。",
  "His reaction was akin to shock.": "他的反应近乎震惊。",
  "Rude remarks can alienate friends.": "无礼的话会疏远朋友。",
};

const files = ["cet4-sample.json", "cet6-sample.json", "kaoyan-sample.json"];
const dir = path.join("src", "data");

for (const f of files) {
  const p = path.join(dir, f);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  let fixed = 0;
  let missing = 0;
  const out = data.map((w) => {
    const example = w.example || (w.examples && w.examples[0]) || "";
    const next = { ...w };
    if (!example) {
      delete next.exampleTranslations;
      return next;
    }
    next.example = example;
    next.examples = [example];
    const zh = ZH[example];
    if (zh && !FAKE_RE.test(zh)) {
      next.exampleTranslations = [zh];
      fixed++;
    } else {
      delete next.exampleTranslations;
      missing++;
      console.warn("missing zh:", example);
    }
    return next;
  });
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
  console.log(`${f}: fixed ${fixed}, missing ${missing}`);
}
