// The three rival clans of the Clan Brawl. Each clan has a fighting style (stats) and three
// members with their own look and personality; members also get their own lines to shout.
//
// style:
//   hp            health
//   damage        multiplier on the base NPC damage table
//   speed         run speed (m/s)
//   guard / dodge chance to block or sidestep an attack they see coming
//   aggression    how eagerly they attack (shorter gaps between swings, longer chains)
//   windup        how long a swing is held before it is released (readability)
//   attackSpeed   playback speed of the swing animation itself
// personality (per member):
//   bravery       retreats below (1 - bravery) * 45% HP; brave fighters may never retreat
//   reaction      seconds before they respond to an incoming attack
//   playerBias    how keen they are to pick a fight with Kairo (negative = avoid him)
//   chatty        how often they talk

export const NPC_DAMAGE = { light: 34, medium: 44, heavy: 70 };

const SKIN = { fair: 0xf2d2be, warm: 0xe8c4a8, tan: 0xd0a080, deep: 0xa8765a };

export const CLANS = [
  {
    id: 'crimson',
    name: 'CRIMSON RONIN',
    css: '#ff4a4a',
    color: 0xff4040,
    style: { hp: 520, damage: 1.1, speed: 6.6, guard: 0.3, dodge: 0.18, aggression: 0.8, windup: 0.3, attackSpeed: 0.85 },
    palette: { coat: 0x5a1218, lining: 0x1a0a0c, suit: 0x1a1214, trousers: 0x221a1c, black: 0x120d0e, armor: 0x2e2426, accent: 0xd42a2a, glove: 0x1a1212, glow: 0xff4040, eye: 0xd08a2a },
    members: [
      { name: 'Takeru', look: { skin: SKIN.warm, hair: 0x18141a, hairStyle: 'topknot', headgear: 'none', pads: 'left', scar: true, thickBrows: true }, bravery: 0.9, reaction: 0.22, playerBias: 1, chatty: 0.8 },
      { name: 'Akane', look: { skin: SKIN.fair, hair: 0x6a1a22, hairStyle: 'long', headgear: 'band', pads: 'left', browAngle: 0.3 }, bravery: 0.7, reaction: 0.16, playerBias: 0.3, chatty: 1 },
      { name: 'Goro', look: { skin: SKIN.tan, hair: 0x1a1414, hairStyle: 'shaved', headgear: 'kasa', pads: 'both', coatLength: 0.7, thickBrows: true }, bravery: 1, reaction: 0.3, playerBias: 0, chatty: 0.5 },
    ],
    lines: {
      greet: ['Steel decides everything.', 'The Ronin bow to no one!', 'Come, let us make some noise.'],
      engage: ['You are mine!', 'Face me!', 'Your clan ends here!'],
      win: ['Next!', 'Is that all?', 'Ha! Too slow!'],
    },
  },
  {
    id: 'azure',
    name: 'AZURE GUARD',
    css: '#5ec8ff',
    color: 0x5ec8ff,
    style: { hp: 600, damage: 0.95, speed: 6.0, guard: 0.6, dodge: 0.12, aggression: 0.5, windup: 0.36, attackSpeed: 0.8 },
    palette: { coat: 0x1c3a6a, lining: 0xd8e4f4, suit: 0x18223a, trousers: 0x1a2236, black: 0x10141e, armor: 0x8a96a8, accent: 0x3a8cff, glove: 0x161c2a, glow: 0x5ec8ff, eye: 0x3a7aff },
    members: [
      { name: 'Sora', look: { skin: SKIN.fair, hair: 0x2a3550, hairStyle: 'bob', headgear: 'band', pads: 'both' }, bravery: 0.6, reaction: 0.15, playerBias: 0, chatty: 0.9 },
      { name: 'Kenji', look: { skin: SKIN.warm, hair: 0x141414, hairStyle: 'topknot', headgear: 'none', pads: 'both', browAngle: 0.05 }, bravery: 0.85, reaction: 0.18, playerBias: -0.5, chatty: 0.6 },
      { name: 'Mio', look: { skin: SKIN.deep, hair: 0xd8dce8, hairStyle: 'long', headgear: 'none', pads: 'both', ponytail: true }, bravery: 0.5, reaction: 0.14, playerBias: -1, chatty: 0.8 },
    ],
    lines: {
      greet: ['Hold the line, everyone.', 'Discipline wins wars.', 'Stay together. Guard up.'],
      engage: ['Stand down!', 'I will stop you here.', 'Guard formation!'],
      win: ['Order is restored.', 'Stay down.', 'Next challenger.'],
    },
  },
  {
    id: 'shadow',
    name: 'SHADOW VIPERS',
    css: '#4aff9a',
    color: 0x4aff9a,
    style: { hp: 430, damage: 1.0, speed: 7.6, guard: 0.12, dodge: 0.5, aggression: 0.65, windup: 0.24, attackSpeed: 0.95 },
    palette: { coat: 0x241a34, lining: 0x1c4a32, suit: 0x141020, trousers: 0x18141e, black: 0x0c0a10, armor: 0x2a2436, accent: 0x2fcf74, glove: 0x100c14, glow: 0x4aff9a, eye: 0x7aff9a, gearColor: 0x16121e },
    members: [
      { name: 'Kage', look: { skin: SKIN.fair, hair: 0x101014, hairStyle: 'wild', headgear: 'mask', pads: 'none', coatLength: 0.45 }, bravery: 0.4, reaction: 0.12, playerBias: 0.5, chatty: 0.7 },
      { name: 'Yuzu', look: { skin: SKIN.warm, hair: 0x4a2a6a, hairStyle: 'bob', headgear: 'mask', pads: 'none', coatLength: 0.45 }, bravery: 0.55, reaction: 0.13, playerBias: 0, chatty: 1 },
      { name: 'Ren', look: { skin: SKIN.tan, hair: 0x2a4a3a, hairStyle: 'wild', headgear: 'mask', pads: 'left', coatLength: 0.5 }, bravery: 0.7, reaction: 0.12, playerBias: 0.2, chatty: 0.6 },
    ],
    lines: {
      greet: ['Strike from the shadows...', 'They will never see us coming.', 'Quietly now.'],
      engage: ['Gotcha.', 'Over here...', 'Behind you!'],
      win: ['Silent and clean.', 'Too easy.', 'Hehe... next.'],
    },
  },
];

// Lines every fighter can use, by situation.
export const LINES = {
  hurt: ['Ugh!', 'Lucky shot...', 'Gah!', 'Tch!', "That one stung."],
  block: ['Blocked!', 'Not even close.', 'Too predictable!', 'Hmph.'],
  dodge: ['Missed me!', 'Too slow!', 'Whoa!', 'Nope!'],
  retreat: ['I need backup!', 'Fall back!', 'Cover me!', 'Not like this...'],
  allyDown: ['{name}! No!', 'They got {name}!', 'Avenge {name}!', "{name}, hang on!"],
  ko: ['Not... yet...', 'Ugh... I yield...', 'Tell my clan...', "I'll be back..."],
  guardBreak: ['My guard!', 'No--!', 'Too strong!'],
  kairo: ['The Blade Master...!', 'Is that Kairo?!', 'Stay away from that one!', 'The Crimson Tempest is here!'],
  power: ['W-what is that power?!', 'His aura... it is unreal!', 'Run! Just run!', 'That is no ordinary blade!'],
  help: ['I have got your back!', 'Leave them alone!', 'Over here, coward!'],
  taunt: ['Come on then!', 'Who is next?!', 'Is that the best you have?'],
  last: ['Just you and me now.', 'Only one of us walks away.', 'So it comes down to this.'],
};

export function pickLine(list, vars = {}) {
  const s = list[(Math.random() * list.length) | 0];
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
