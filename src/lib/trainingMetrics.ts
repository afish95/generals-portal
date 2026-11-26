/** Why each training stat matters and how to move it. Our own coaching copy. */
export const METRIC_INFO: Record<string, { why: string; improve: string }> = {
  mound_velo: {
    why: 'Velocity shrinks a hitter’s decision time. Every extra mph makes your other pitches play better.',
    improve: 'Train intent on High days, build lower-half drive and hip-shoulder separation, and stay on your lifting and recovery.',
  },
  pulldown_velo: {
    why: 'Pulldowns show your arm’s top-end speed without the mound. Gains here usually show up on the mound later.',
    improve: 'Run-and-gun throws on velocity days with full intent, plus PlyoCare drills to clean up your arm path.',
  },
  long_toss: {
    why: 'Distance builds arm strength and a loose, efficient arm action that holds up over a season.',
    improve: 'Stretch it out slowly over the week, stay on a line coming back in, and never skip your arm care.',
  },
  strike_pct: {
    why: 'Strikes keep you in the game. Pitchers who live in the zone face fewer batters and win more counts.',
    improve: 'Simplify your delivery, repeat your release, and throw tracked bullpens with a target every pitch.',
  },
  ahead_pct: {
    why: 'Getting to 2 strikes in the first 3 pitches is the biggest predictor of a good outcome for a pitcher.',
    improve: 'Throw the Ahead in the Count bullpen, attack with your best strike pitch early, and commit to every pitch.',
  },
  miss_in: {
    why: 'Command is hitting the exact spot you want. Small misses turn into weak contact, big misses into damage.',
    improve: 'Pick a small target, use the 13-zone bullpen tracker, and finish your delivery toward the glove.',
  },
  bat_speed: {
    why: 'Bat speed drives exit velo and gives you more time to decide. It’s the engine of hitting for power.',
    improve: 'Overload/underload swings, rotational med-ball work, and full-intent swings with a sensor.',
  },
  exit_velo: {
    why: 'Hard-hit balls fall for hits far more often. Exit velo is the clearest measure of quality contact.',
    improve: 'Train bat speed, then square it up: tee and front-toss rounds aimed at the middle of the field.',
  },
  time_to_first: {
    why: 'Speed puts pressure on the defense, beats out ground balls and turns singles into extra bases.',
    improve: 'Sprint mechanics, short acceleration work and a quick first step out of the box.',
  },
  pos_velo: {
    why: 'Arm strength in the field gets outs on close plays and keeps runners from taking extra bases.',
    improve: 'Long toss, footwork into your throws, and throwing on a line with a crow hop.',
  },
  pop_time: {
    why: 'A fast pop time shuts down the running game and gives your pitcher more freedom.',
    improve: 'Quick exchange reps, clean footwork and an accurate throw to the bag over pure arm speed.',
  },
}

/** Exercises a player can log for each stat. */
export const STAT_EXERCISES: { metric: string; exerciseId: number; label: string; unit: string; side: 'pitching' | 'hitting' }[] = [
  { metric: 'bat_speed', exerciseId: 22, label: 'Bat Speed', unit: 'mph', side: 'hitting' },
  { metric: 'exit_velo', exerciseId: 20, label: 'Exit Velo (Tee)', unit: 'mph', side: 'hitting' },
  { metric: 'exit_velo', exerciseId: 21, label: 'Exit Velo (Front Toss)', unit: 'mph', side: 'hitting' },
  { metric: 'time_to_first', exerciseId: 27, label: 'Home to 1st', unit: 'sec', side: 'hitting' },
  { metric: 'pos_velo', exerciseId: 28, label: 'Positional Velo', unit: 'mph', side: 'hitting' },
  { metric: 'pop_time', exerciseId: 29, label: 'Pop Time', unit: 'sec', side: 'hitting' },
  { metric: 'mound_velo', exerciseId: 13, label: 'Mound Velo', unit: 'mph', side: 'pitching' },
  { metric: 'pulldown_velo', exerciseId: 14, label: 'Pulldown Velo', unit: 'mph', side: 'pitching' },
  { metric: 'long_toss', exerciseId: 15, label: 'Long Toss', unit: 'ft', side: 'pitching' },
]

/** Sunday that starts the week containing `iso` (training weeks run Sun–Sat). */
export function sundayOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - dt.getDay())
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Which sides of the game a player trains. */
export const sidesFor = (position: string | null | undefined): ('pitching' | 'hitting')[] =>
  position === 'pitcher' ? ['pitching'] : position === 'two_way' ? ['pitching', 'hitting'] : ['hitting']
