import assert from "node:assert/strict";
import test from "node:test";

import { syncMaterialsToDrive } from "../src/drive/sync-materials.js";

test("organiza materiais por disciplina e seção e cria guia de avaliações", async () => {
  const folders: string[] = [];
  const files: Array<{ name: string; parentId: string; sourceId: string }> = [];
  const result = await syncMaterialsToDrive({
    courses: [{ code: "GCC128", name: "Inteligência Artificial", period: "2026/2" }],
    importantDates: [{
      id: "exam-1",
      courseCode: "GCC128",
      courseName: "Inteligência Artificial",
      title: "Projeto #01",
      type: "Trabalho",
      start: "2026-09-01",
      content: "KNN",
    }],
    moodle: {
      async getActivities() {
        return [{
          courseCode: "GCC128",
          courseName: "Inteligência Artificial",
          moduleId: 10,
          name: "Aula de KNN",
          sectionName: "Aprendizado de Máquina",
          attachments: [{ name: "knn.pdf", apiUrl: "https://campus/material/knn.pdf", mimeType: "application/pdf" }],
        }];
      },
      async downloadAttachment() {
        return new Uint8Array([1, 2, 3]);
      },
    },
    drive: {
      async getOrCreateFolder(name, parentId) {
        folders.push(`${parentId ?? "root"}/${name}`);
        return `folder-${folders.length}`;
      },
      async uploadFile(file) {
        files.push({ name: file.name, parentId: file.parentId, sourceId: file.sourceId });
        return "created";
      },
    },
  });

  assert.deepEqual(folders, [
    "root/Campus Virtual - 2026.2",
    "folder-1/GCC128 - Inteligência Artificial",
    "folder-2/Aprendizado de Máquina",
  ]);
  assert.deepEqual(files.map((file) => file.name), ["Guia de avaliações.md", "knn.pdf"]);
  assert.equal(files[1]?.sourceId, "https://campus/material/knn.pdf");
  assert.deepEqual(result, {
    rootFolderId: "folder-1",
    activitiesFound: 1,
    filesCreated: 2,
    filesUpdated: 0,
    filesUnchanged: 0,
    filesFailed: 0,
  });
});

