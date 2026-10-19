// constants/foods.ts — everyday foods that are always searchable, even offline: values per 100 g
// (USDA FoodData Central; home-style Indian dishes are typical recipes, marked approx) plus the
// portion people actually eat (1 roti = 40 g, 1 egg = 50 g, a bowl of dal = 150 g).

export interface CommonFood {
  name: string;
  aliases: string[];          // other names people type: 'chapati' finds Roti, 'dahi' finds Curd
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  serving: { grams: number; unit: string };
  approx: boolean;            // a home-made dish: varies with the recipe
}

type Row = [name: string, kcal: number, protein: number, carbs: number, fat: number,
  grams: number, unit: string, aliases?: string, approx?: 1];

// name, kcal, protein, carbs, fat (per 100 g), portion grams, portion name, aliases, approx
const ROWS: Row[] = [
  // Meat, fish, eggs
  ['Chicken breast (cooked)', 165, 31, 0, 3.6, 100, 'portion', 'chicken, grilled chicken, boiled chicken, chicken breast'],
  ['Chicken breast (raw)', 120, 22.5, 0, 2.6, 100, 'portion', 'raw chicken'],
  ['Chicken thigh (cooked)', 209, 26, 0, 10.9, 100, 'portion', 'chicken leg, drumstick'],
  ['Tandoori chicken', 150, 24, 3, 5, 150, 'portion', 'chicken tikka, tikka, tandoori', 1],
  ['Chicken curry', 145, 14, 4, 8, 150, 'bowl', 'chicken gravy, chicken masala', 1],
  ['Butter chicken', 165, 12, 5, 11, 150, 'bowl', 'murgh makhani, chicken makhani', 1],
  ['Chicken biryani', 165, 8, 20, 6, 250, 'plate', 'biryani, biriyani', 1],
  ['Egg (whole, boiled)', 155, 12.6, 1.1, 10.6, 50, 'egg', 'egg, eggs, boiled egg, anda'],
  ['Egg white', 52, 10.9, 0.7, 0.2, 33, 'egg white', 'egg whites'],
  ['Omelette', 154, 10.6, 0.6, 11.7, 120, 'omelette', 'omelet, scrambled eggs, egg bhurji'],
  ['Egg curry', 140, 8.5, 4.5, 10, 150, 'bowl', 'anda curry', 1],
  ['Salmon (cooked)', 206, 22, 0, 12.4, 100, 'portion', 'fish'],
  ['Tuna (canned in water)', 116, 25.5, 0, 0.8, 100, 'portion', 'tuna'],
  ['White fish (cooked)', 128, 26, 0, 2.7, 100, 'portion', 'fish, tilapia, basa, rohu, cod'],
  ['Fish curry', 120, 13, 4, 6, 150, 'bowl', 'fish gravy', 1],
  ['Prawns (cooked)', 99, 24, 0.2, 0.3, 100, 'portion', 'shrimp, prawn'],
  ['Mutton (cooked)', 143, 27, 0, 3, 100, 'portion', 'goat, lamb'],
  ['Mutton curry', 175, 14, 4, 11, 150, 'bowl', 'lamb curry, goat curry', 1],
  ['Lean beef (cooked)', 217, 26, 0, 11.7, 100, 'portion', 'beef, minced beef, ground beef, mince'],
  ['Turkey breast (cooked)', 135, 30, 0, 0.7, 100, 'portion', 'turkey'],
  // Dairy and vegetarian protein
  ['Paneer', 265, 18, 1.2, 21, 100, 'portion', 'indian cottage cheese'],
  ['Paneer butter masala', 200, 7, 7, 16, 150, 'bowl', 'paneer masala, shahi paneer, paneer curry', 1],
  ['Palak paneer', 150, 7, 5, 11, 150, 'bowl', 'saag paneer', 1],
  ['Paneer bhurji', 230, 13, 5, 18, 150, 'bowl', '', 1],
  ['Tofu (firm)', 144, 17.3, 2.8, 8.7, 100, 'portion', 'tofu'],
  ['Tofu (soft)', 76, 8, 1.9, 4.8, 100, 'portion', 'silken tofu'],
  ['Soya chunks (dry)', 345, 52, 33, 0.5, 30, 'serving', 'soya, soy chunks, meal maker, nutrela'],
  ['Whey protein', 390, 75, 8, 6, 32, 'scoop', 'protein powder, protein shake, whey'],
  ['Casein protein', 360, 73, 9, 3, 33, 'scoop', 'casein'],
  ['Protein bar', 360, 33, 35, 11, 60, 'bar', ''],
  ['Greek yogurt (plain)', 73, 10, 3.9, 1.9, 170, 'cup', 'greek yoghurt, hung curd'],
  ['Curd (dahi)', 61, 3.5, 4.7, 3.3, 150, 'bowl', 'dahi, curd, yogurt, yoghurt, plain yogurt'],
  ['Milk (whole)', 61, 3.2, 4.8, 3.3, 250, 'glass', 'milk, full fat milk, full cream milk'],
  ['Milk (toned)', 58, 3.1, 4.7, 3, 250, 'glass', 'milk, low fat milk'],
  ['Milk (skimmed)', 34, 3.4, 5, 0.1, 250, 'glass', 'skim milk, fat free milk'],
  ['Cottage cheese (low fat)', 81, 10.5, 4.8, 2.3, 100, 'portion', 'cottage cheese'],
  ['Cheddar cheese', 403, 24.9, 1.3, 33.1, 30, 'serving', 'cheese'],
  ['Cheese slice', 300, 18, 4, 24, 20, 'slice', 'processed cheese, cheese', 1],
  ['Mozzarella', 300, 22, 2.2, 22.4, 30, 'serving', 'cheese, pizza cheese'],
  ['Butter', 717, 0.9, 0.1, 81, 14, 'tbsp', 'makhan'],
  ['Ghee', 876, 0.3, 0, 99.5, 5, 'tsp', 'clarified butter'],
  ['Cooking oil', 884, 0, 0, 100, 14, 'tbsp', 'oil, olive oil, sunflower oil, mustard oil, coconut oil'],
  // Nuts and seeds
  ['Peanut butter', 588, 25, 20, 50, 16, 'tbsp', 'peanut'],
  ['Almonds', 579, 21.2, 21.6, 49.9, 30, 'handful', 'badam, almond, nuts'],
  ['Peanuts (roasted)', 585, 24.4, 21.3, 49.7, 30, 'handful', 'groundnut, moongphali, peanut, nuts'],
  ['Cashews', 553, 18.2, 30.2, 43.9, 30, 'handful', 'kaju, cashew, nuts'],
  ['Walnuts', 654, 15.2, 13.7, 65.2, 30, 'handful', 'akhrot, walnut, nuts'],
  ['Chia seeds', 486, 16.5, 42.1, 30.7, 12, 'tbsp', 'chia'],
  ['Flax seeds', 534, 18.3, 28.9, 42.2, 10, 'tbsp', 'alsi, linseed, flaxseed'],
  ['Pumpkin seeds', 559, 30.2, 10.7, 49, 15, 'tbsp', 'pepitas'],
  // Grains and staples
  ['White rice (cooked)', 130, 2.7, 28.2, 0.3, 150, 'bowl', 'rice, chawal, basmati rice, steamed rice'],
  ['Brown rice (cooked)', 123, 2.7, 25.6, 1, 150, 'bowl', 'rice'],
  ['Jeera rice', 150, 3, 26, 4, 150, 'bowl', 'pulao, veg pulao', 1],
  ['Veg fried rice', 165, 4, 26, 5, 200, 'plate', 'fried rice', 1],
  ['Roti (chapati)', 255, 9, 54, 1.3, 40, 'roti', 'roti, chapati, chapatti, phulka, fulka'],
  ['Paratha (plain)', 320, 8, 45, 13, 80, 'paratha', 'parantha', 1],
  ['Aloo paratha', 250, 5.5, 36, 9.5, 120, 'paratha', 'potato paratha, stuffed paratha', 1],
  ['Naan', 291, 9.6, 50.6, 5.7, 90, 'naan', 'butter naan, nan'],
  ['Puri', 380, 7, 45, 18, 25, 'puri', 'poori', 1],
  ['Bread (white)', 265, 9, 49, 3.2, 25, 'slice', 'bread, toast, white bread'],
  ['Bread (whole wheat)', 252, 12.5, 42.7, 3.5, 30, 'slice', 'brown bread, wheat bread, multigrain bread, bread'],
  ['Oats (dry)', 389, 16.9, 66.3, 6.9, 40, 'serving', 'oats, oatmeal, rolled oats, porridge'],
  ['Muesli', 370, 10, 66, 6, 45, 'bowl', 'cereal', 1],
  ['Cornflakes', 357, 7.5, 84, 0.4, 30, 'bowl', 'corn flakes, cereal'],
  ['Poha', 140, 2.6, 24, 3.8, 200, 'plate', 'aval, flattened rice', 1],
  ['Upma', 125, 3, 18, 4.5, 200, 'plate', 'rava upma, uppittu', 1],
  ['Idli', 135, 4.5, 28, 0.5, 40, 'idli', 'idly'],
  ['Dosa (plain)', 165, 4, 27, 4.5, 90, 'dosa', 'dosai, plain dosa', 1],
  ['Masala dosa', 175, 4, 26, 6.5, 200, 'dosa', 'dosa', 1],
  ['Medu vada', 290, 10, 30, 15, 40, 'vada', 'vada, vadai', 1],
  ['Sambar', 65, 3, 9, 2, 150, 'bowl', 'sambhar', 1],
  ['Khichdi', 120, 4.5, 19, 2.5, 200, 'bowl', 'khichri', 1],
  ['Pasta (cooked)', 158, 5.8, 30.9, 0.9, 140, 'cup', 'spaghetti, macaroni, penne'],
  ['Instant noodles (dry)', 440, 9, 62, 17, 70, 'pack', 'maggi, ramen, noodles', 1],
  ['Potato (boiled)', 87, 1.9, 20.1, 0.1, 150, 'potato', 'aloo, potatoes'],
  ['Sweet potato (baked)', 90, 2, 20.7, 0.2, 130, 'potato', 'shakarkandi'],
  ['Quinoa (cooked)', 120, 4.4, 21.3, 1.9, 185, 'cup', 'quinoa'],
  ['Sweet corn (boiled)', 96, 3.4, 21, 1.5, 100, 'serving', 'corn, bhutta'],
  // Dal and beans
  ['Dal (cooked)', 105, 6, 14, 3, 150, 'bowl', 'dal, daal, dhal, toor dal, moong dal, masoor dal, dal tadka, dal fry, lentil curry', 1],
  ['Lentils (boiled)', 116, 9, 20, 0.4, 100, 'portion', 'masoor, lentil'],
  ['Chickpeas (boiled)', 164, 8.9, 27.4, 2.6, 100, 'portion', 'chana, kabuli chana, garbanzo'],
  ['Chole', 150, 6, 18, 6, 150, 'bowl', 'chana masala, chole masala', 1],
  ['Rajma (boiled)', 127, 8.7, 22.8, 0.5, 100, 'portion', 'kidney beans, red beans'],
  ['Rajma curry', 130, 6, 17, 4, 150, 'bowl', 'rajma masala, rajma chawal', 1],
  ['Moong sprouts', 30, 3, 5.9, 0.2, 100, 'bowl', 'sprouts, bean sprouts, moong'],
  ['Hummus', 166, 7.9, 14.3, 9.6, 30, 'serving', 'houmous'],
  // Vegetables
  ['Mixed vegetable sabzi', 90, 2.5, 9, 5, 150, 'bowl', 'sabzi, sabji, vegetable curry, mix veg', 1],
  ['Broccoli', 34, 2.8, 6.6, 0.4, 100, 'portion', ''],
  ['Spinach', 23, 2.9, 3.6, 0.4, 100, 'portion', 'palak'],
  ['Carrot', 41, 0.9, 9.6, 0.2, 60, 'carrot', 'gajar, carrots'],
  ['Cucumber', 15, 0.7, 3.6, 0.1, 100, 'portion', 'kheera'],
  ['Tomato', 18, 0.9, 3.9, 0.2, 120, 'tomato', 'tamatar, tomatoes'],
  ['Onion', 40, 1.1, 9.3, 0.1, 110, 'onion', 'pyaz, onions'],
  ['Green salad', 20, 1.2, 3.5, 0.2, 100, 'bowl', 'salad'],
  ['Mushrooms', 22, 3.1, 3.3, 0.3, 100, 'portion', 'mushroom'],
  ['Green peas', 81, 5.4, 14.5, 0.4, 100, 'portion', 'peas, matar'],
  // Fruit
  ['Banana', 89, 1.1, 22.8, 0.3, 118, 'banana', 'kela, bananas'],
  ['Apple', 52, 0.3, 13.8, 0.2, 182, 'apple', 'seb, apples'],
  ['Orange', 47, 0.9, 11.8, 0.1, 130, 'orange', 'santra, mosambi, oranges'],
  ['Mango', 60, 0.8, 15, 0.4, 200, 'mango', 'aam, mangoes'],
  ['Grapes', 69, 0.7, 18.1, 0.2, 150, 'cup', 'angoor'],
  ['Papaya', 43, 0.5, 10.8, 0.3, 150, 'cup', 'papita'],
  ['Watermelon', 30, 0.6, 7.6, 0.2, 150, 'cup', 'tarbooz'],
  ['Pineapple', 50, 0.5, 13.1, 0.1, 165, 'cup', 'ananas'],
  ['Strawberries', 32, 0.7, 7.7, 0.3, 150, 'cup', 'strawberry'],
  ['Blueberries', 57, 0.7, 14.5, 0.3, 150, 'cup', 'blueberry'],
  ['Pomegranate', 83, 1.7, 18.7, 1.2, 100, 'portion', 'anar'],
  ['Guava', 68, 2.6, 14.3, 1, 100, 'guava', 'amrood'],
  ['Dates', 282, 2.5, 75, 0.4, 8, 'date', 'khajur, date'],
  ['Raisins', 299, 3.1, 79.2, 0.5, 15, 'handful', 'kishmish'],
  ['Avocado', 160, 2, 8.5, 14.7, 150, 'avocado', ''],
  // Snacks and sweets
  ['Samosa', 290, 5, 30, 17, 80, 'samosa', '', 1],
  ['Biscuits (glucose)', 450, 7, 76, 13, 25, 'serving', 'biscuit, parle g, marie, cookies', 1],
  ['Dark chocolate', 598, 7.8, 45.9, 42.6, 20, 'serving', 'chocolate'],
  ['Milk chocolate', 535, 7.6, 59.4, 29.7, 25, 'bar', 'chocolate, dairy milk'],
  ['Popcorn', 387, 12.9, 77.8, 4.5, 25, 'bowl', ''],
  ['Potato chips', 536, 7, 53, 35, 25, 'pack', 'chips, crisps, lays'],
  ['Ice cream', 207, 3.5, 23.6, 11, 70, 'scoop', 'icecream'],
  ['Gulab jamun', 300, 4, 50, 10, 50, 'piece', '', 1],
  ['Honey', 304, 0.3, 82.4, 0, 21, 'tbsp', 'shahad'],
  ['Sugar', 387, 0, 100, 0, 4, 'tsp', 'cheeni, shakkar'],
  ['Jaggery', 383, 0.4, 98, 0.1, 10, 'piece', 'gur'],
  // Drinks
  ['Tea with milk and sugar', 55, 1.5, 7.5, 1.8, 150, 'cup', 'chai, tea, masala chai', 1],
  ['Coffee with milk', 50, 2, 6, 2, 150, 'cup', 'coffee, latte, cappuccino, filter coffee', 1],
  ['Black coffee', 2, 0.3, 0, 0, 240, 'cup', 'coffee, americano, espresso'],
  ['Orange juice', 45, 0.7, 10.4, 0.2, 250, 'glass', 'juice'],
  ['Soft drink (cola)', 42, 0, 10.6, 0, 330, 'can', 'coke, pepsi, soda, cola'],
  ['Coconut water', 19, 0.7, 3.7, 0.2, 250, 'glass', 'nariyal pani'],
  ['Sweet lassi', 80, 2.5, 13, 2, 250, 'glass', 'lassi', 1],
  ['Buttermilk (chaas)', 25, 1.2, 2.6, 1, 250, 'glass', 'chaas, chhach, mattha', 1],
  ['Beer', 43, 0.5, 3.6, 0, 330, 'bottle', ''],
  // Eating out
  ['Pizza (cheese)', 266, 11.4, 33.3, 9.7, 107, 'slice', 'pizza'],
  ['Burger', 255, 12.5, 30, 9.5, 150, 'burger', 'hamburger, cheeseburger', 1],
  ['French fries', 312, 3.4, 41.4, 14.7, 117, 'serving', 'fries'],
  ['Veg sandwich', 190, 6, 28, 6, 130, 'sandwich', 'sandwich', 1],
  ['Momos (steamed)', 140, 5, 22, 3.5, 150, 'plate', 'momo, dumplings', 1],
  ['Pav bhaji', 165, 4, 22, 7, 260, 'plate', 'pav, bhaji', 1],
];

export const COMMON_FOODS: CommonFood[] = ROWS.map(([name, kcal, protein, carbs, fat, grams, unit, aliases, approx]) => ({
  name,
  aliases: (aliases ?? '').split(',').map(a => a.trim()).filter(Boolean),
  per100: { kcal, protein, carbs, fat },
  serving: { grams, unit },
  approx: approx === 1,
}));

/** Shown before anything is typed: what people log most. */
export const POPULAR_FOODS = [
  'Egg (whole, boiled)', 'Chicken breast (cooked)', 'Roti (chapati)', 'White rice (cooked)', 'Dal (cooked)',
  'Paneer', 'Curd (dahi)', 'Milk (toned)', 'Whey protein', 'Oats (dry)', 'Banana', 'Peanut butter',
].map(n => COMMON_FOODS.find(f => f.name === n)!).filter(Boolean);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Edit distance, stopping early once it's over `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** How well one name matches the typed words (0 = not at all). */
function score(name: string, q: string, words: string[]): number {
  if (name === q) return 100;
  if (name.startsWith(q)) return 85;
  const parts = name.split(' ');
  // Every typed word starts a word of the name: 'chick bre' → Chicken breast
  if (words.every(w => parts.some(p => p.startsWith(w)))) return 70;
  if (name.includes(q)) return 50;
  // Typos: 'panner' → paneer, 'chiken' → chicken (words of 4+ letters, one slip each)
  if (words.every(w => parts.some(p => p.startsWith(w) || (w.length >= 4 && within(w, p.slice(0, w.length + 1), 1) )))) return 30;
  return 0;
}

const POPULAR = new Set(POPULAR_FOODS.map(f => f.name));

/** Common foods matching what was typed, best first; ties go to what people log most. */
export function searchCommonFoods(query: string, limit = 20): CommonFood[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  return COMMON_FOODS
    .map((food, i) => {
      // The real name counts a little more than an alias
      const s = Math.max(score(norm(food.name), q, words) + 2, ...food.aliases.map(a => score(norm(a), q, words)));
      return { food, s: s > 2 ? s : 0, pop: POPULAR.has(food.name) ? 1 : 0, i };
    })
    .filter(r => r.s > 0)
    .sort((a, b) => b.s - a.s || b.pop - a.pop || a.i - b.i)
    .slice(0, limit)
    .map(r => r.food);
}
