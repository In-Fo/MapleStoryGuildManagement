const BASE_URL = 'https://open.api.nexon.com/maplestory/v1';

document.getElementById('switch').addEventListener('change', function () {
    const showImages = this.checked;
    localStorage.setItem('showCharacterImages', showImages);
    toggleCharacterImages(showImages);
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('apiKey').value = localStorage.getItem('apiKey') || '';
    document.getElementById('server').value = localStorage.getItem('server') || '스카니아';
    document.getElementById('guildName').value = localStorage.getItem('guildName') || '';
    const isChecked = localStorage.getItem('showCharacterImages') !== 'false';
    document.getElementById('switch').checked = isChecked;
    toggleCharacterImages(isChecked);
});

function toggleCharacterImages(show) {
    document.querySelectorAll('.character-img').forEach(img => {
        img.style.display = show ? 'block' : 'none';
    });
}

document.getElementById('guildForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const apiKey = document.getElementById('apiKey').value;
    const server = document.getElementById('server').value;
    const guildName = document.getElementById('guildName').value;
    const resultDiv = document.getElementById('result');

    if (!apiKey) {
        alert("API Key를 입력하세요.");
        return;
    }

    localStorage.setItem('apiKey', apiKey);
    localStorage.setItem('server', server);
    localStorage.setItem('guildName', guildName);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const date = yesterday.toJSON().slice(0, 10);

    start(apiKey, server, guildName, resultDiv, date);
});

async function fetchWithApiKey(url, apiKey) {
    const response = await fetch(url, {
        headers: { "x-nxopen-api-key": apiKey }
    });
    return response.ok ? response.json() : null;
}
async function getCharacterRanking(apiKey, ocid, date) {
    const data = await fetchWithApiKey(`${BASE_URL}/ranking/overall?date=${date}&ocid=${ocid}`, apiKey);
    return data?.ranking?.[0];
}

const ocidCache = {};

async function findChrOcid(apiKey, chrName) {
    if (ocidCache[chrName]) return ocidCache[chrName];
    const data = await fetchWithApiKey(`${BASE_URL}/id?character_name=${chrName}`, apiKey);
    if (data && data.ocid) {
        ocidCache[chrName] = data.ocid;
        return data.ocid;
    }
    return null;
}

async function getCharImg(apiKey, chrOcid, date){
    const data = await fetchWithApiKey(`${BASE_URL}/character/basic?ocid=${chrOcid}&date=${date}`, apiKey);
    return data.character_image;
}

async function findGuildMember(apiKey, guildOcid, date) {
    if (!guildOcid) return [];
    const data = await fetchWithApiKey(`${BASE_URL}/guild/basic?oguild_id=${guildOcid}&date=${date}`, apiKey);
    return data?.guild_member || [];
}

async function findMainCharacter(apiKey, chrOcid, server, date) {
    if (!chrOcid) return -1;
    const data = await fetchWithApiKey(`${BASE_URL}/ranking/union?date=${date}&world_name=${server}&ocid=${chrOcid}&page=1`, apiKey);
    return data?.ranking?.[0]?.character_name || -1;
}

async function findGuild(apiKey, chrOcid, date) {
    if (!chrOcid) return "길드x";
    const data = await fetchWithApiKey(`${BASE_URL}/character/basic?ocid=${chrOcid}&date=${date}`, apiKey);
    return data?.character_guild_name || "길드x";
}

async function checkCharacterProgress(apiKey, ocid) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const yesterdayData = await getCharacterRanking(apiKey, ocid, yesterday.toJSON().slice(0, 10));
    const thirtyDaysAgoData = await getCharacterRanking(apiKey, ocid, thirtyDaysAgo.toJSON().slice(0, 10));

    if (!yesterdayData || !thirtyDaysAgoData) return '';

    if (yesterdayData.character_level != thirtyDaysAgoData.character_level ||
        yesterdayData.character_exp != thirtyDaysAgoData.character_exp) {
        return '';
    }

    return ' --';
}

async function start(apiKey, server, guildName, resultDiv, date) {
    if (apiKey.startsWith("test")) {
        resultDiv.innerHTML = "개발단계의 API 키를 입력하셨습니다.<br>개발단계의 API 키는 요청 횟수 제한으로 인해 원활한 서비스가 불가능합니다. 서비스 단계의 API 키를 발급받아서 이용해주세요.";
        return;
    }
    const isChecked = document.getElementById('switch').checked;
    let counter = 0;
    
    try {
        const guildData = await fetchWithApiKey(`${BASE_URL}/guild/id?guild_name=${guildName}&world_name=${server}`, apiKey);
        if (!guildData?.oguild_id) {
            resultDiv.innerHTML = "길드를 찾을 수 없습니다.";
            return;
        }

        const members = await findGuildMember(apiKey, guildData.oguild_id, date);
        if (members.length === 0) {
            resultDiv.innerHTML = "길드원이 없습니다.";
            return;
        }

        let processedMembers = {};
        let multiGuildMembers = {};

        for (const member of members) {
            try {
                counter++;
                resultDiv.innerHTML = `<br>길드원 정보를 불러오는 중...<br>${counter}/${members.length}`;

                const crrChrOcid = await findChrOcid(apiKey, member);
                if (!crrChrOcid) continue;

                const [mainChr, progressIndicator] = await Promise.all([
                    findMainCharacter(apiKey, crrChrOcid, server, date),
                    checkCharacterProgress(apiKey, crrChrOcid)
                ]);

                if (mainChr === -1) continue;

                const mainChrOcid = await findChrOcid(apiKey, mainChr);
                const mainChrProgress = await checkCharacterProgress(apiKey, mainChrOcid);
                const [mainChrImg, mainGuild] = await Promise.all([
                    getCharImg(apiKey, mainChrOcid, date),
                    findGuild(apiKey, mainChrOcid, date)
                ]);

                if (guildName !== mainGuild) {
                    if (!multiGuildMembers[mainChr]) {
                        multiGuildMembers[mainChr] = {
                            guild: mainGuild,
                            characters: []
                        };
                    }
                    multiGuildMembers[mainChr].characters.push(`${member}${progressIndicator}`);
                } else {
                    if (!processedMembers[mainChr]) {
                        processedMembers[mainChr] = { subChars: [], img: mainChrImg, status: mainChrProgress};
                    }
                    if (member !== mainChr) {
                        processedMembers[mainChr].subChars.push(`${member}${progressIndicator}`);
                    }
                }
            } catch (error) {
                console.error(`${member} 오류 발생:`, error);
            }
        }

        let output = `<h3>${guildName} 길드 정보</h3><p>본캐 기준 실질 길드원: ${Object.keys(processedMembers).length}명</p><div class="character-grid">`;
        let dp = isChecked ? 'block' : 'none';

        for (const [mainChar, { subChars, img, status}] of Object.entries(processedMembers)) {
            output += `
            <div class="character-card">
                <div class="main-character">
                    <img src="${img}" alt="${mainChar}" class="character-img" style="width:100px; display:${dp}; height:auto; margin: 0 auto;">
                    <a href="https://meaegi.com/s/${mainChar}" target="_blank" style="color:black; text-decoration:none;">${mainChar}${status}</a>
                    <p style="font-size:0.7em; margin-top: 0px; margin-bottom: 0px;">부캐 수 : ${subChars.length}</p>
                </div>
                <hr>
                <div class="sub-characters">
                    ${subChars.length > 0 ? subChars.map(char => `<a href="https://meaegi.com/s/${char.replace(' --', '')}" target="_blank" style="color:black; text-decoration:none;">${char}</a>`).join('<br>') : 'x'}
                </div>
            </div>`;
        }

        output += "</div><h3>이중길드 목록</h3><div class='character-grid'>";
        for (const [mainChar, info] of Object.entries(multiGuildMembers)) {
            output += `
            <div class="character-card">
                <div class="main-character"><a href="https://meaegi.com/s/${mainChar}" target="_blank" style="color:black; text-decoration:none;">${mainChar}</a> (${info.guild})</div>
                <hr>
                <div class="sub-characters">
                    ${info.characters.map(char => `<a href="https://meaegi.com/s/${char.replace(' --', '')}" target="_blank" style="color:black; text-decoration:none;">${char}</a>`).join('<br>')}
                </div>
            </div>`;
        }

        output += "</div>";
        resultDiv.innerHTML = output;
    } catch (error) {
        console.error('Error:', error);
        resultDiv.innerHTML = "오류가 발생했습니다.";
    }
}
