import { group as d3Group } from "d3-array"

import type {
    APIItemGeneric,
    APIRecipeModuleResource,
    APIRecipeResource,
    APIShipUpgradeBookItem,
} from "./@types/api-item.js"
import type { Recipe, RecipeEntity, RecipeGroup } from "./@types/recipes.js"
import { cleanName } from "./common/api.js"
import { getAPIFilename, readJson, saveJsonAsync } from "./common/file.js"
import { getCommonPaths } from "./common/path.js"
import { serverIds } from "./common/servers.js"
import { simpleStringSort, sortBy } from "./common/sort.js"
import { currentServerStartDate as serverDate } from "./common/time.js"

interface Ingredient {
    id: number
    name: string
    recipeNames: string[]
}

let apiItems: APIItemGeneric[]
const commonPaths = getCommonPaths()

// noinspection SpellCheckingInspection
const craftGroups = new Map([
    ["AdmiralityShips", "Admirality permits"],
    ["AdmiraltyBooks", "Admirality books"],
    ["AdmiraltyModules", "Admirality setModules"],
    ["AdmiraltyRecipes", "Admirality blueprints"],
    ["AdmiraltyResourcesAndMaterials", "Admirality resources"],
    ["AdmiraltyRewards", "PVP rewards"],
    ["Cannons", "Repairs"],
    ["Exchange", "Exchange"],
    ["Manufacturing", "Manufacturing"],
    ["WoodWorking", "Cannons"],
])

const recipeItemTypes = new Set(["Recipe", "RecipeModule", "RecipeResource"])
const recipeUsingResults = new Set(["Recipe", "RecipeResource"])
const itemIsUsed = new Set([
    1525, // Labor Contract
    1939, // Extra Labor Contracts Blueprint
    2336, // Labor Contract
    2460, // Additional Outpost Permit Blueprint
    2461, // Additional dock permit Blueprint
    2480, // Admiraal de Ruyter Permit Blueprint
    2482, // Diana Permit Blueprint
])

const convertRecipes = async (): Promise<void> => {
    const data = {} as Recipe
    const recipes = [] as RecipeEntity[]
    const ingredients = new Map<number, Ingredient>()

    data.recipe = []
    data.ingredient = []

    const itemNames = new Map(apiItems.filter((item) => !item.NotUsed).map((item) => [item.Id, cleanName(item.Name)]))

    const moduleNames = new Map(
        (apiItems.filter((item) => item.ItemType === "ShipUpgradeBookItem") as unknown as APIShipUpgradeBookItem[]).map(
            (item) => [item.Id, itemNames.get(item.Upgrade) ?? ""],
        ),
    )

    const ingredientIds = new Map(
        apiItems
            .filter(
                (item) =>
                    !item.NotUsed &&
                    (item.ItemType === "ShipUpgradeBookItem" || item.SortingGroup === "Resource.Trading"),
            )
            .map((item) => [item.Id, item.Id]),
    )

    const upgradeIds = new Map(
        apiItems.filter((item) => !item.NotUsed && item.Upgrade).map((item) => [item.Id, item.Upgrade ?? 0]),
    )

    const filteredItems = apiItems
        .filter((item) => item.Id !== 1361 && item.Id !== 1956)
        .filter(
            (apiRecipe) =>
                recipeItemTypes.has(apiRecipe.ItemType) && (!apiRecipe.NotUsed || itemIsUsed.has(apiRecipe.Id)),
        ) as APIRecipeResource[] | APIRecipeModuleResource[]
    for (const apiRecipe of filteredItems) {
        const resultReference = recipeUsingResults.has(apiRecipe.ItemType)
            ? apiRecipe.Results[0]
            : (apiRecipe as APIRecipeModuleResource).Qualities[0].Results[0]
        const recipe = {
            id: apiRecipe.Id,
            name: cleanName(apiRecipe.Name)
                .replace(" Blueprint", "")
                .replace(" - ", " – ")
                .replace("u2013", "–")
                .replace(/ $/, ""),
            module: typeof apiRecipe.Results[0] === "undefined" ? "" : moduleNames.get(apiRecipe.Results[0].Template),
            goldPrice: apiRecipe.GoldRequirements,
            itemRequirements: apiRecipe.FullRequirements.map((requirement) => ({
                name: itemNames.get(requirement.Template),
                amount: requirement.Amount,
            })).sort(sortBy(["name"])),
            result: {
                id: upgradeIds.has(resultReference.Template)
                    ? upgradeIds.get(resultReference.Template)
                    : resultReference.Template,
                name: itemNames.get(resultReference.Template),
                amount: resultReference.Amount,
            },
            craftGroup: craftGroups.has(apiRecipe.CraftGroup)
                ? craftGroups.get(apiRecipe.CraftGroup)
                : apiRecipe.CraftGroup,
            serverType: apiRecipe.ServerType,
        } as RecipeEntity

        // if result exists
        if (recipe.result.name) {
            recipes.push(recipe)
        }

        const apiIngredients = apiRecipe.FullRequirements.filter((APIingredient) =>
            ingredientIds.has(APIingredient.Template),
        )
        for (const apiIngredient of apiIngredients) {
            const recipeName = recipe.module ? recipe.module : recipe.name.replace(" Blueprint", "")
            if (ingredients.has(apiIngredient.Template)) {
                const updatedIngredient = ingredients.get(apiIngredient.Template) ?? ({} as Ingredient)
                updatedIngredient.recipeNames.push(recipeName)
                updatedIngredient.recipeNames.sort(simpleStringSort)
                ingredients.set(apiIngredient.Template, updatedIngredient)
            } else {
                const ingredient = {
                    id: apiIngredient.Template,
                    name: itemNames.get(apiIngredient.Template),
                    recipeNames: [recipeName],
                } as Ingredient
                ingredients.set(apiIngredient.Template, ingredient)
            }
        }
    }

    // @ts-expect-error typing sort
    data.recipe = [...d3Group(recipes, (recipe) => recipe.craftGroup)].sort(sortBy(["id"])).map(([group, recipes]) => {
        return {
            group,
            recipes: recipes.map((recipe) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { craftGroup, ...recipeCleaned } = recipe
                return recipeCleaned
            }),
        } as RecipeGroup
    })
    const result = [...ingredients.values()]
    data.ingredient = result.sort(sortBy(["id"]))

    await saveJsonAsync(commonPaths.fileRecipe, data)
}

export const convertRecipeData = (): void => {
    apiItems = readJson(getAPIFilename(`${serverIds[0]}-ItemTemplates-${serverDate}.json`)) as APIItemGeneric[]

    void convertRecipes()
}
