const BASE_URL = 'https://open.api.nexon.com/maplestory/v1';

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('apiKey').value = localStorage.getItem('apiKey') || '';
    document.getElementById('server').value = localStorage.getItem('server') || '스카니아';
    document.getElementById('guildName').value = localStorage.getItem('guildName') || '';
});

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
    if (!chrOcid) return "길드 없음";
    const data = await fetchWithApiKey(`${BASE_URL}/character/basic?ocid=${chrOcid}&date=${date}`, apiKey);
    return data?.character_guild_name || "길드 없음";
}

async function start(apiKey, server, guildName, resultDiv, date) {
    try {
        resultDiv.innerHTML = "길드 정보를 불러오는 중...";

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
        let multiGuildMembers = [];

        const memberPromises = members.map(async (member) => {
            try {
                const crrChrOcid = await findChrOcid(apiKey, member);
                if (!crrChrOcid) return null;

                const mainChr = await findMainCharacter(apiKey, crrChrOcid, server, date);
                if (mainChr === -1) return null;

                const mainGuild = await findGuild(apiKey, await findChrOcid(apiKey, mainChr), date);

                if (guildName !== mainGuild) {
                    multiGuildMembers.push({ 
                        currentCharacter: member, 
                        mainCharacter: mainChr, 
                        guild: mainGuild 
                    });
                    return null;
                }

                if (!(mainChr in processedMembers)) {
                    processedMembers[mainChr] = [];
                }
                if (member !== mainChr) {
                    processedMembers[mainChr].push(member);
                }
            } catch (error) {
                console.error(`Error processing ${member}:`, error);
            }
        });

        await Promise.all(memberPromises);

        let output = `<br><h3 style="display:inline;">본캐 - 부캐 목록</h3>&nbsp;&nbsp;본캐 기준 실질 길드원 : ${Object.keys(processedMembers).length}명<br><br><div class='character-grid'>`;

        for (const [mainChar, subChars] of Object.entries(processedMembers)) {
            output += `
                <div class="character-card">
                    <div class="main-character"><a href="https://meaegi.com/s/${mainChar}" target="_blank" style="color:black; text-decoration:none;">${mainChar}</a></div>
                    <hr>
                    <div class="sub-characters">
                        ${subChars.length > 0 
                            ? subChars.map(subChar => `<div><a href="https://meaegi.com/s/${subChar}" target="_blank" style="color:black; text-decoration:none;">${subChar}</a></div>`).join('')
                            : '<div>x</div>'}
                    </div>
                </div>
            `;
        }

        output += '</div><h3>이중길드 목록</h3><div class="character-grid">';

        let groupedMultiGuildMembers = {};
        multiGuildMembers.forEach(entry => {
            if (!groupedMultiGuildMembers[entry.mainCharacter]) {
                groupedMultiGuildMembers[entry.mainCharacter] = {
                    guild: entry.guild,
                    characters: []
                };
            }
            groupedMultiGuildMembers[entry.mainCharacter].characters.push(entry.currentCharacter);
        });

        for (const [mainChar, data] of Object.entries(groupedMultiGuildMembers)) {
            output += `
                <div class="character-card">
                    <div class="main-character"><a href="https://meaegi.com/s/${mainChar}" target="_blank" style="color:black; text-decoration:none;">${mainChar}</a> (${data.guild})</div>
                    <hr>
                    <div class="sub-characters">
                        ${data.characters.map(char => `<div><a href="https://meaegi.com/s/${char}" target="_blank" style="color:black; text-decoration:none;">${char}</a></div>`).join('')}
                    </div>
                </div>
            `;
        }

        output += '</div>';
        resultDiv.innerHTML = output;

    } catch (error) {
        console.error('Error:', error);
        resultDiv.innerHTML = '오류가 발생했습니다. 다시 시도해주세요.';
    }
}
