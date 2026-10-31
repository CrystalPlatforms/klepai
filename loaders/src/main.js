import "./style.css";

const loaders = [
  "error",
  "planning",
  "discombobulating", "writing", "reading",
  "searching", "analyzing", "fetching", "creating",
  "reviewing", "thinking", "idle", "generating",
  "connecting",
];

const gallery = document.querySelector("#gallery");

for (const name of loaders) {
  const preview = document.createElement("iframe");
  preview.className = "loader-preview";
  preview.src = "/loaders/" + name + ".html";
  preview.title = "Podgląd animowanego statusu";
  preview.loading = name === "error" || name === "planning" ? "eager" : "lazy";
  gallery.append(preview);
}
