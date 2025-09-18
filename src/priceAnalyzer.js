const fs = require('fs-extra');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

function analyzePrices(restaurants) {
  if (!restaurants || restaurants.length === 0) {
    return { cheapest: null, medium: null, expensive: null };
  }

  // Fiyata göre sırala
  const sorted = restaurants.sort((a, b) => a.price - b.price);
  
  const cheapest = sorted[0];
  const expensive = sorted[sorted.length - 1];
  
  // Orta segment (medyan)
  const middleIndex = Math.floor(sorted.length / 2);
  const medium = sorted[middleIndex];
  
  console.log('\n--- FİYAT ANALİZİ ---');
  console.log(`En Ucuz: ${cheapest.name} - ${cheapest.price} ₺`);
  console.log(`Orta Segment: ${medium.name} - ${medium.price} ₺`);
  console.log(`En Pahalı: ${expensive.name} - ${expensive.price} ₺`);
  console.log('----------------------\n');
  
  return { cheapest, medium, expensive, all: sorted };
}

async function saveResults(data, filename = 'results.csv') {
  try {
    const csvWriter = createCsvWriter({
      path: `./data/${filename}`,
      header: [
        { id: 'foodName', title: 'Aranan Yemek' },
        { id: 'productName', title: 'Ürün Adı' },
        { id: 'restaurantName', title: 'Restoran Adı' },
        { id: 'price', title: 'Fiyat (₺)' },
        { id: 'category', title: 'Kategori' },
        { id: 'timestamp', title: 'Tarih' }
      ]
    });

    await csvWriter.writeRecords(data);
    console.log(`Sonuçlar ${filename} dosyasına kaydedildi`);
    
  } catch (error) {
    console.error('Sonuç kaydetme hatası:', error);
  }
}

module.exports = { analyzePrices, saveResults };