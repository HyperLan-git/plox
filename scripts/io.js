const VERSION = 1;
const MAGIC = "PLO";

function export_all() {
    const data = new Blob(
        [MAGIC, String(VERSION), '\n', JSON.stringify({fx: fx.serialize(), mod: serializeModulations()})],
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

async function import_all() {
    const pickerOpts = {
        types: [
            {
                description: "Audio fx exported file",
                accept: {
                    "application/octet-stream": [".afx"],
                },
            },
        ],
        excludeAcceptAllOption: true,
        multiple: false
    };

    const contents = await window.showOpenFilePicker(pickerOpts).then((handle) => {
        return handle[0].getFile().then((file) => file.text());
    });

    if(!contents.startsWith(MAGIC)) {
        return false;
    }

    closeFx();

    const lines = contents.split("\n");
    const header = lines[0];
    const data = JSON.parse(lines[1]);

    console.log(header.substring(3));
    switch(header.substring(3)) {
        case '1':
            const nodes = fx.deserialize(data.fx);
            deserializeModulations(nodes, data.mod);
            break;
        case '2':
        default:
            return false;
    }
    return true;
}