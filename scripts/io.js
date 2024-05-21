const VERSION = 1;
const MAGIC = "PLO";

async function export_all() {
    const data = new Blob(
        [MAGIC, String(VERSION), '\n', JSON.stringify(fx.serialize())],
        {
            type: "application/octet-stream",
        }
    );
    const a = document.createElement('a');
    a.download = 'plox.afx';
    a.href = window.URL.createObjectURL(data);
    a.dataset.downloadurl = [data.type, a.download, a.href].join(':');
    a.click();
}