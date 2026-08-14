export type ImportantDate = {
  id: string;
  courseCode: string;
  courseName: string;
  title: string;
  type: "Atividade" | "Prova" | "Trabalho" | "Recuperação";
  start: string;
  end?: string;
  weight?: number;
  content?: string;
  notes?: string;
};

export type PlannedAbsence = {
  courseCode: string;
  courseName: string;
  dates: string[];
};
