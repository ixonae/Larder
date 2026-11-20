import { nameKey } from "@larder/shared";
import type { ProcessedImage } from "../../storage/process.ts";
import { categoryPictureKey } from "./import.ts";

const pantry = (slug: string) => `pantry-icons/${slug}`;
const art = (slug: string) => `category-child-icons/${slug}`;

/** Categories inherit the closest illustrated ancestor unless they have a more specific picture. */
const artwork = [
  [art("gin"), "Spirit/Gin", "Spirit/Genever", "Spirit/Aquavit"],
  [
    art("vodka"),
    "Spirit/Vodka",
    "Spirit/Pisco",
    "Spirit/Grappa",
    "Spirit/Grappa/Unaged grappa",
    "Spirit/Eau-de-vie",
    "Spirit/Fruit spirit",
    "Spirit/Korn",
    "Spirit/Baijiu",
    "Spirit/Shōchū",
    "Spirit/Soju",
    "Spirit/Arak",
    "Spirit/Rakı",
    "Spirit/Ouzo",
    "Spirit/Rum/White rum",
    "Spirit/Rum/Rhum agricole",
    "Spirit/Cachaça/Unaged cachaça",
    "Wine/Sake",
    "Liqueur/Maraschino",
    "Liqueur/Sambuca",
    "Liqueur/Anisette",
    "Liqueur/Peach schnapps",
    "Liqueur/Elderflower liqueur",
    "Liqueur/Orange liqueur/Triple sec",
    "Liqueur/Crème de menthe/Crème de menthe (white)",
    "Liqueur/Crème de cacao/Crème de cacao (white)",
  ],
  [
    art("agave"),
    "Spirit/Tequila",
    "Spirit/Mezcal",
    "Spirit/Raicilla",
    "Spirit/Bacanora",
    "Spirit/Sotol",
  ],
  [art("rum"), "Spirit/Rum", "Spirit/Cachaça"],
  [
    art("orange-liqueur"),
    "Liqueur/Orange liqueur",
    "Liqueur/Limoncello",
    "Liqueur/Apricot brandy",
    "Liqueur/Peach brandy",
    "Liqueur/Passion fruit liqueur",
    "Liqueur/Ginger liqueur",
    "Beer/Cider",
    "Beer/Perry",
  ],
  [art("blue-liqueur"), "Liqueur/Orange liqueur/Blue curaçao"],
  [art("cream-liqueur"), "Liqueur/Cream liqueur", "Liqueur/Coconut liqueur"],
  [
    art("coffee-liqueur"),
    "Liqueur/Coffee liqueur",
    "Liqueur/Chocolate liqueur",
    "Liqueur/Crème de cacao",
  ],
  [art("herbal-liqueur"), "Spirit/Absinthe", "Liqueur/Herbal liqueur", "Liqueur/Crème de menthe"],
  [
    art("white-wine"),
    "Wine/White wine",
    "Wine/Sherry",
    "Wine/Vermouth/Dry vermouth",
    "Wine/Vermouth/Bianco vermouth",
    "Wine/Port/White port",
  ],
  [
    art("rose-wine"),
    "Wine/Rosé wine",
    "Wine/Orange wine",
    "Wine/Vermouth/Rosé vermouth",
    "Wine/Port/Rosé port",
  ],
  [art("sparkling-wine"), "Wine/Sparkling wine", "Wine/Sake/Sparkling sake"],
  [art("root-juice"), "Juice/Mango juice"],
  [
    art("dark-beer"),
    "Beer/Ale/Porter",
    "Beer/Ale/Stout",
    "Beer/Lager/Dunkel",
    "Beer/Lager/Schwarzbier",
    "Beer/Wheat beer/Dunkelweizen",
  ],
  [art("red-juice"), "Juice/Cranberry juice", "Juice/Pomegranate juice", "Juice/Tomato juice"],
  [art("pale-juice"), "Juice/Apple juice", "Juice/Guava juice", "Juice/Sugarcane juice"],
  [art("cola"), "Mixer/Cola"],
  [pantry("orange"), "Juice/Orange juice"],
  [pantry("lemon"), "Juice/Lemon juice", "Mixer/Sparkling lemonade"],
  [pantry("lime"), "Juice/Lime juice", "Mixer/Lemon-lime soda", "Garnish/Citrus"],
  [pantry("grapefruit"), "Juice/Grapefruit juice", "Mixer/Pink grapefruit soda"],
  [pantry("pineapple"), "Juice/Pineapple juice"],
  [pantry("white-grapes"), "Juice/Verjus"],
  [pantry("passion-fruit"), "Juice/Passion fruit juice"],
  [pantry("ginger"), "Mixer/Ginger ale", "Mixer/Ginger beer"],
  [pantry("mint"), "Garnish/Herbs"],
  [pantry("cream"), "Pantry/Dairy"],
  [pantry("coffee-beans"), "Pantry/Coffee and tea"],
  [pantry("elderflower-cordial"), "Syrup/Elderflower cordial"],
  [pantry("fresh-berries"), "Garnish/Other fruit"],
  [pantry("nutmeg"), "Garnish/Spices"],
  [pantry("green-olive"), "Garnish/Preserved garnishes"],
  [pantry("egg"), "Pantry/Eggs"],
  [pantry("sugar"), "Pantry/Sweeteners"],
  [pantry("salt"), "Pantry/Seasonings"],
  [pantry("vanilla-extract"), "Pantry/Infusions"],
  [pantry("white-peach-puree"), "Pantry/Purées"],
  [pantry("simple-syrup"), "Syrup/Simple syrup", "Syrup/Vanilla syrup"],
  [pantry("demerara-syrup"), "Syrup/Demerara syrup", "Syrup/Cinnamon syrup", "Syrup/Maple syrup"],
  [pantry("honey-syrup"), "Syrup/Honey syrup", "Syrup/Ginger syrup"],
  [pantry("grenadine"), "Syrup/Grenadine"],
  [pantry("orgeat"), "Syrup/Orgeat"],
  [pantry("raspberry-syrup"), "Syrup/Raspberry syrup"],
  [pantry("passion-fruit-syrup"), "Syrup/Passion fruit syrup"],
  [pantry("agave-nectar"), "Syrup/Agave nectar"],
  [pantry("chamomile-cordial"), "Syrup/Chamomile cordial"],
] as const;

const overrides = new Map(
  artwork.flatMap(([picture, ...paths]) =>
    paths.map((path) => [categoryPictureKey(path.split("/")), picture] as const),
  ),
);

const pantryFallbacks = new Map([
  ["garnish", pantry("lime")],
  ["pantry", pantry("sugar")],
  ["syrup", pantry("simple-syrup")],
]);

export function starterCategoryPictures(
  paths: Iterable<readonly [string, ...string[]]>,
  readIcon: (path: string) => ProcessedImage,
): Map<string, ProcessedImage> {
  const pictures = new Map<string, ProcessedImage>();
  for (const path of paths) {
    const root = nameKey(path[0]);
    let picture = pantryFallbacks.get(root) ?? art(`root-${root}`);
    for (let length = 2; length <= path.length; length++) {
      const key = categoryPictureKey(path.slice(0, length));
      picture = overrides.get(key) ?? picture;
      pictures.set(key, readIcon(picture));
    }
  }
  return pictures;
}
