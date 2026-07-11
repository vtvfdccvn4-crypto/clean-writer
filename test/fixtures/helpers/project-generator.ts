export async function generateLargeProject(rootDirHandle: FileSystemDirectoryHandle, sectionCount: number) {
  // Spread sections across folders so outline and search traverse a realistic tree.
  const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';

  const sectionsDir = await rootDirHandle.getDirectoryHandle('sections', { create: true });
  const sectionsPerFolder = 5;

  for (let i = 0; i < sectionCount; i++) {
    const folderNumber = Math.floor(i / sectionsPerFolder) + 1;
    const chapterDir = await sectionsDir.getDirectoryHandle(`Chapter${folderNumber}`, { create: true });
    let content = `# Section ${i + 1} Title\n\n${lorem}\n\n`;
    for (let j = 0; j < 5; j++) {
      content += `## Subheading ${i + 1}.${j + 1}\n\n${lorem}\n\n`;
    }
    // Add a specific token to the last section for the search test
    if (i === sectionCount - 1) {
      content += '\n\nPERFORMANCE_SEARCH_TOKEN_XYZ\n\n';
    }
    
    const fileHandle = await chapterDir.getFileHandle(`Section${i + 1}.md`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}
