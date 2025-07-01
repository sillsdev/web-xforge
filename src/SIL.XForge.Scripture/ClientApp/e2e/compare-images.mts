import fs from "node:fs";
import pixelmatch from "npm:pixelmatch";
import { PNG } from "npm:pngjs";

/**
 * Compares two PNG images and returns true if they differ. If pathB does not exist, the images are considered
 * different. If pathA does not exist, the function will throw an error.
 * @param pathA - Path to the first image.
 * @param pathB - Path to the second image.
 * @param diffPath - Optional path to save the diff image. If provided, the diff image will be saved to this path,
 * unless the images are identical, or of different sizes.
 * @returns {boolean} - Returns true if the images differ, false otherwise.
 */
export function pngImagesDiffer(pathA: string, pathB: string, diffPath?: string): boolean {
  console.log(`Comparing images: ${pathA} and ${pathB}`);

  if (!fs.existsSync(pathB)) return true;

  const img1 = PNG.sync.read(fs.readFileSync(pathA));
  const img2 = PNG.sync.read(fs.readFileSync(pathB));

  if (img1.width !== img2.width || img1.height !== img2.height) return true;

  const width = img1.width;
  const height = img1.height;
  const diff = new PNG({ width, height });

  const numberOfMismatchedPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });

  if (diffPath && numberOfMismatchedPixels > 0) {
    console.log(`${numberOfMismatchedPixels} pixels differ. Writing diff image to ${diffPath}`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  return numberOfMismatchedPixels > 0;
}
